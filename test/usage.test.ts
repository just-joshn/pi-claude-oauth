import { describe, expect, it } from "vitest";
import {
  CLAUDE_USAGE_URL,
  fetchUsage,
  formatResetTime,
  formatUsage,
  parseUsage,
} from "../extensions/claude-oauth/usage";

const signal = () => new AbortController().signal;

const response = (body: unknown, status = 200): Response =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const usagePayload = {
  five_hour: { utilization: 24.6, resets_at: "2030-01-01T12:00:00Z" },
  seven_day: { utilization: 41, resets_at: "2030-01-02T12:00:00Z" },
  seven_day_opus: { utilization: 0 },
  seven_day_sonnet: { utilization: 103 },
  seven_day_oauth_apps: { utilization: 99 },
};

describe("parseUsage", () => {
  it("reads the documented usage windows", () => {
    expect(parseUsage(usagePayload)).toEqual({
      buckets: [
        { label: "5-hour window", utilization: 24.6, resetsAt: "2030-01-01T12:00:00Z" },
        { label: "7-day window", utilization: 41, resetsAt: "2030-01-02T12:00:00Z" },
        { label: "7-day Opus", utilization: 0, resetsAt: undefined },
        { label: "7-day Sonnet", utilization: 100, resetsAt: undefined },
      ],
    });
  });

  it("skips windows the account does not have", () => {
    expect(parseUsage({ five_hour: { utilization: 1 } }).buckets).toHaveLength(1);
  });

  it("rejects a non-object response", () => {
    expect(() => parseUsage([])).toThrow(/unexpected usage response/);
  });

  it("rejects an account without usage windows", () => {
    expect(() => parseUsage({})).toThrow(/no usage windows/);
  });

  it("ignores malformed windows", () => {
    expect(() => parseUsage({ five_hour: { utilization: "high" } })).toThrow(/no usage windows/);
  });
});

describe("formatUsage", () => {
  it("rounds utilization and shows reset times", () => {
    const lines = formatUsage(parseUsage(usagePayload), () => "Mon 09:00");
    expect(lines).toEqual([
      "5-hour window: 25% (resets Mon 09:00)",
      "7-day window: 41% (resets Mon 09:00)",
      "7-day Opus: 0%",
      "7-day Sonnet: 100%",
    ]);
  });

  it("omits an unparseable reset time", () => {
    const lines = formatUsage(parseUsage({ five_hour: { utilization: 5, resets_at: "nope" } }));
    expect(lines).toEqual(["5-hour window: 5%"]);
  });
});

describe("formatResetTime", () => {
  it("formats an ISO timestamp", () => {
    expect(formatResetTime("2030-01-01T12:00:00Z")).toBeTruthy();
  });

  it("rejects an invalid timestamp", () => {
    expect(formatResetTime("not-a-date")).toBeUndefined();
  });
});

describe("fetchUsage", () => {
  it("calls the OAuth usage endpoint with the documented headers", async () => {
    let captured: { url: string; headers: unknown } | undefined;
    const report = await fetchUsage("sk-ant-oat01-token", {
      signal: signal(),
      fetch: async (input, init) => {
        captured = { url: String(input), headers: init?.headers };
        return response(usagePayload);
      },
    });

    expect(captured?.url).toBe(CLAUDE_USAGE_URL);
    expect(captured?.headers).toMatchObject({
      authorization: "Bearer sk-ant-oat01-token",
      "anthropic-beta": "oauth-2025-04-20",
      "x-app": "cli",
    });
    expect(report.buckets).toHaveLength(4);
  });

  it("asks for a new sign-in when the token is rejected", async () => {
    await expect(
      fetchUsage("token", { signal: signal(), fetch: async () => response({}, 401) }),
    ).rejects.toThrow(/\/login claude/);
  });

  it("reports other HTTP failures", async () => {
    await expect(
      fetchUsage("token", { signal: signal(), fetch: async () => response({}, 503) }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("reports invalid JSON", async () => {
    await expect(fetchUsage("token", { signal: signal(), fetch: async () => response("<html>") })).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it("reports an unreachable endpoint", async () => {
    await expect(
      fetchUsage("token", {
        signal: signal(),
        fetch: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow(/Could not reach/);
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchUsage("token", {
        signal: controller.signal,
        fetch: async () => {
          throw new Error("aborted");
        },
      }),
    ).rejects.toThrow(/cancelled/);
  });
});
