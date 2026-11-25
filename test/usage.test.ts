import {
  deepStrictEqual,
  ok,
  partialDeepStrictEqual,
  rejects,
  strictEqual,
  throws,
} from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { FetchLike } from "../src/oauth.ts";
import {
  CLAUDE_USAGE_URL,
  fetchUsage,
  formatResetTime,
  formatUsage,
  parseUsage,
} from "../src/usage.ts";

/** Like a real request, the pending socket keeps the process alive until the abort; Node unrefs `AbortSignal.timeout`. */
const hangUntilAborted: FetchLike = (_url, { signal }) =>
  new Promise((_resolve, reject) => {
    const socket = setTimeout(() => {}, 60_000);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(socket);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

const response = (body: unknown, status = 200): Response =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const usagePayload = {
  five_hour: { utilization: 24.6, resets_at: "2030-01-01T12:00:00Z" },
  seven_day: { utilization: 41, resets_at: "2030-01-02T12:00:00Z" },
  seven_day_opus: { utilization: 0 },
  seven_day_sonnet: { utilization: 103 },
  seven_day_oauth_apps: { utilization: 99 },
};

await describe("parseUsage", async () => {
  await it("reads the documented usage windows", () => {
    deepStrictEqual(parseUsage(usagePayload), {
      buckets: [
        { label: "5-hour window", utilization: 24.6, resetsAt: "2030-01-01T12:00:00Z" },
        { label: "7-day window", utilization: 41, resetsAt: "2030-01-02T12:00:00Z" },
        { label: "7-day Opus", utilization: 0, resetsAt: undefined },
        { label: "7-day Sonnet", utilization: 100, resetsAt: undefined },
      ],
    });
  });

  await it("skips windows the account does not have", () => {
    strictEqual(parseUsage({ five_hour: { utilization: 1 } }).buckets.length, 1);
  });

  await it("rejects a non-object response", () => {
    throws(() => parseUsage([]), /unexpected usage response/);
  });

  await it("rejects an account without usage windows", () => {
    throws(() => parseUsage({}), /no usage windows/);
  });

  await it("ignores malformed windows", () => {
    throws(() => parseUsage({ five_hour: { utilization: "high" } }), /no usage windows/);
  });
});

await describe("formatUsage", async () => {
  await it("rounds utilization and shows reset times", () => {
    const lines = formatUsage(parseUsage(usagePayload), () => "Mon 09:00");
    deepStrictEqual(lines, [
      "5-hour window: 25% (resets Mon 09:00)",
      "7-day window: 41% (resets Mon 09:00)",
      "7-day Opus: 0%",
      "7-day Sonnet: 100%",
    ]);
  });

  await it("omits an unparseable reset time", () => {
    const lines = formatUsage(parseUsage({ five_hour: { utilization: 5, resets_at: "nope" } }));
    deepStrictEqual(lines, ["5-hour window: 5%"]);
  });
});

await describe("formatResetTime", async () => {
  await it("formats an ISO timestamp", () => {
    ok(formatResetTime("2030-01-01T12:00:00Z"));
  });

  await it("rejects an invalid timestamp", () => {
    strictEqual(formatResetTime("not-a-date"), undefined);
  });
});

await describe("fetchUsage", async () => {
  await it("calls the OAuth usage endpoint with the documented headers", async () => {
    let captured: { url: string; headers: unknown } | undefined;
    const report = await fetchUsage("sk-ant-oat01-token", {
      fetch: async (url, init) => {
        captured = { url, headers: init.headers };
        return response(usagePayload);
      },
    });

    strictEqual(captured?.url, CLAUDE_USAGE_URL);
    partialDeepStrictEqual(captured.headers, {
      authorization: "Bearer sk-ant-oat01-token",
      "anthropic-beta": "oauth-2025-04-20",
      "x-app": "cli",
    });
    strictEqual(report.buckets.length, 4);
  });

  await it("asks for a new sign-in when the token is rejected", async () => {
    await rejects(fetchUsage("token", { fetch: async () => response({}, 401) }), /\/login claude/);
  });

  await it("reports other HTTP failures", async () => {
    await rejects(fetchUsage("token", { fetch: async () => response({}, 503) }), /HTTP 503/);
  });

  await it("cancels an unused error body without masking the HTTP failure", async () => {
    const cancellation = mock.fn(async () => {
      throw new Error("cleanup failure");
    });
    const body = new ReadableStream({ cancel: cancellation });

    await rejects(
      fetchUsage("fixture", { fetch: async () => new Response(body, { status: 503 }) }),
      /HTTP 503/,
    );
    strictEqual(cancellation.mock.callCount(), 1);
  });

  await it("reports invalid JSON", async () => {
    await rejects(fetchUsage("token", { fetch: async () => response("<html>") }), /not valid JSON/);
  });

  await it("reports an unreachable endpoint", async () => {
    await rejects(
      fetchUsage("token", {
        fetch: async () => {
          throw new Error("offline");
        },
      }),
      /Could not reach/,
    );
  });

  await it("reports a timeout", async () => {
    await rejects(
      fetchUsage("token", {
        timeoutMs: 5,
        fetch: hangUntilAborted,
      }),
      /did not answer/,
    );
  });
});
