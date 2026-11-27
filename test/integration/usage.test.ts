import { describe, expect, it, vi } from "vitest";

import { CLAUDE_USAGE_URL, fetchUsage, formatResetTime, formatUsage, parseUsage } from "../../src/usage.ts";

const response = (body: unknown, status = 200): Response =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const usagePayload = {
	five_hour: { utilization: 24.6, resets_at: "2030-01-01T12:00:00Z" },
	seven_day: { utilization: 41, resets_at: "2030-01-02T12:00:00Z" },
	seven_day_opus: { utilization: 0 },
	seven_day_sonnet: { utilization: 103 },
	seven_day_oauth_apps: { utilization: 99 },
};

const liveUsagePayload = {
	five_hour: { utilization: 2.0, resets_at: "2026-11-26T14:39:59.659791+00:00" },
	seven_day: { utilization: 36.0, resets_at: "2026-12-01T06:59:59.659810+00:00" },
	seven_day_oauth_apps: null,
	seven_day_opus: null,
	seven_day_sonnet: null,
	limits: [
		{
			kind: "session",
			group: "session",
			percent: 2,
			severity: "normal",
			resets_at: "2026-11-26T14:39:59.659791+00:00",
			scope: null,
			is_active: false,
		},
		{
			kind: "weekly_all",
			group: "weekly",
			percent: 36,
			severity: "normal",
			resets_at: "2026-12-01T06:59:59.659810+00:00",
			scope: null,
			is_active: true,
		},
		{
			kind: "weekly_scoped",
			group: "weekly",
			percent: 2,
			severity: "normal",
			resets_at: "2026-12-01T06:59:59.659999+00:00",
			scope: { model: { id: null, display_name: "Fable" }, surface: null },
			is_active: false,
		},
	],
};

describe("parseUsage", () => {
	it("shows per-model weekly caps reported in limits", () => {
		expect(parseUsage(liveUsagePayload).buckets).toEqual([
			{ label: "5-hour window", utilization: 2, resetsAt: "2026-11-26T14:39:59.659791+00:00" },
			{ label: "7-day window", utilization: 36, resetsAt: "2026-12-01T06:59:59.659810+00:00" },
			{ label: "7-day Fable", utilization: 2, resetsAt: "2026-12-01T06:59:59.659999+00:00" },
		]);
	});

	it("removes terminal controls from model names shown in usage cards", () => {
		const decoratedName = `${String.fromCharCode(27)}[31mFable${String.fromCharCode(27)}[0m`;
		const report = parseUsage({
			limits: [{ kind: "weekly_scoped", percent: 2, scope: { model: { display_name: decoratedName } } }],
		});
		expect(formatUsage(report)).toEqual(["7-day Fable: 2%"]);
	});

	it("skips scoped weekly limits without a usable percent", () => {
		const payload = {
			five_hour: { utilization: 1 },
			limits: [
				{ kind: "weekly_scoped", percent: null, scope: { model: { display_name: "Fable" } } },
				{ kind: "weekly_scoped", percent: "2", scope: { model: { display_name: "Opus" } } },
			],
		};
		expect(parseUsage(payload).buckets.map((bucket) => bucket.label)).toEqual(["5-hour window"]);
	});

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

	it("tells apart resets a week apart at the same clock time", () => {
		expect(formatResetTime("2030-01-03T12:00:00Z")).not.toBe(formatResetTime("2030-01-10T12:00:00Z"));
	});

	it("rejects an invalid timestamp", () => {
		expect(formatResetTime("not-a-date")).toBeUndefined();
	});
});

describe("fetchUsage", () => {
	it("calls the OAuth usage endpoint with the documented headers", async () => {
		let captured: { url: string; headers: unknown } | undefined;
		const report = await fetchUsage("sk-ant-oat01-token", {
			fetch: async (url, init) => {
				captured = { url, headers: init.headers };
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

	it("points to /login, which wins over the environment, when the token is rejected", async () => {
		await expect(fetchUsage("token", { fetch: async () => response({}, 401) })).rejects.toThrow(
			"Claude rejected this token for usage lookup (HTTP 401). Run /login claude to sign in again or paste a new setup token.",
		);
	});

	it("reports other HTTP failures", async () => {
		await expect(fetchUsage("token", { fetch: async () => response({}, 503) })).rejects.toThrow(/HTTP 503/);
	});

	it("cancels an unused error body without masking the HTTP failure", async () => {
		const cancellation = vi.fn(async () => {
			throw new Error("cleanup failure");
		});
		const body = new ReadableStream({ cancel: cancellation });

		await expect(fetchUsage("fixture", { fetch: async () => new Response(body, { status: 503 }) })).rejects.toThrow(
			/HTTP 503/,
		);
		expect(cancellation).toHaveBeenCalledTimes(1);
	});

	it("reports invalid JSON", async () => {
		await expect(fetchUsage("token", { fetch: async () => response("<html>") })).rejects.toThrow(/not valid JSON/);
	});

	it("reports an unreachable endpoint", async () => {
		await expect(
			fetchUsage("token", {
				fetch: async () => {
					throw new Error("offline");
				},
			}),
		).rejects.toThrow(/Could not reach/);
	});

	it("reports a timeout", async () => {
		await expect(
			fetchUsage("token", {
				timeoutMs: 5,
				fetch: (_input, init) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
					}),
			}),
		).rejects.toThrow(/did not answer/);
	});
});
