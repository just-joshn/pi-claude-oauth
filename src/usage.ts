import { CLAUDE_PROVIDER_ID } from "./models.ts";
import { CLAUDE_OAUTH_BETA, ClaudeAuthError, type FetchLike, fetchJsonWithDeadline, isRecord } from "./oauth.ts";
import { terminalText } from "./terminal-text.ts";

export const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

const DEFAULT_TIMEOUT_MS = 15_000;

const BUCKETS = [
	["five_hour", "5-hour window"],
	["seven_day", "7-day window"],
	["seven_day_opus", "7-day Opus"],
	["seven_day_sonnet", "7-day Sonnet"],
] as const;

interface UsageBucket {
	readonly label: string;
	readonly utilization: number;
	readonly resetsAt?: string | undefined;
}

export interface UsageReport {
	readonly buckets: readonly UsageBucket[];
}

interface FetchUsageOptions {
	readonly fetch?: FetchLike | undefined;
	readonly timeoutMs?: number;
}

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

function scopedWeeklyBucket(limit: unknown): UsageBucket | undefined {
	if (!isRecord(limit) || limit.kind !== "weekly_scoped") {
		return undefined;
	}
	const percent = limit.percent;
	const scope = limit.scope;
	const model = isRecord(scope) ? scope.model : undefined;
	const name = isRecord(model) ? model.display_name : undefined;
	if (typeof percent !== "number" || !Number.isFinite(percent) || typeof name !== "string") {
		return undefined;
	}
	return {
		label: `7-day ${terminalText(name)}`,
		utilization: clampPercent(percent),
		resetsAt: typeof limit.resets_at === "string" ? limit.resets_at : undefined,
	};
}

export function parseUsage(value: unknown): UsageReport {
	if (!isRecord(value)) throw new ClaudeAuthError("Claude returned an unexpected usage response.");

	const buckets: UsageBucket[] = [];
	for (const [key, label] of BUCKETS) {
		const raw = value[key];
		if (!isRecord(raw)) continue;
		if (typeof raw.utilization !== "number" || !Number.isFinite(raw.utilization)) continue;
		buckets.push({
			label,
			utilization: clampPercent(raw.utilization),
			resetsAt: typeof raw.resets_at === "string" ? raw.resets_at : undefined,
		});
	}

	for (const limit of Array.isArray(value.limits) ? value.limits : []) {
		const bucket = scopedWeeklyBucket(limit);
		if (bucket) {
			buckets.push(bucket);
		}
	}

	if (buckets.length === 0) {
		throw new ClaudeAuthError("Claude reported no usage windows for this account.");
	}
	return { buckets };
}

export function formatResetTime(value: string): string | undefined {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatUsage(
	report: UsageReport,
	formatReset: (value: string) => string | undefined = formatResetTime,
): string[] {
	return report.buckets.map((bucket) => {
		const reset = bucket.resetsAt ? formatReset(bucket.resetsAt) : undefined;
		return `${bucket.label}: ${Math.round(bucket.utilization)}%${reset ? ` (resets ${reset})` : ""}`;
	});
}

export async function fetchUsage(accessToken: string, options: FetchUsageOptions = {}): Promise<UsageReport> {
	const { ok, status, payload } = await fetchJsonWithDeadline(
		CLAUDE_USAGE_URL,
		{
			headers: {
				authorization: `Bearer ${accessToken}`,
				accept: "application/json",
				"anthropic-beta": CLAUDE_OAUTH_BETA,
				"x-app": "cli",
			},
		},
		{ fetch: options.fetch, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
	);

	if (status === 401 || status === 403) {
		throw new ClaudeAuthError(
			`Claude rejected this token for usage lookup (HTTP ${status}). Run /login ${CLAUDE_PROVIDER_ID} to sign in again or paste a new setup token.`,
		);
	}
	if (!ok) {
		throw new ClaudeAuthError(`Claude usage lookup failed (HTTP ${status}).`);
	}

	if (payload === undefined) {
		throw new ClaudeAuthError("Claude returned usage data that was not valid JSON.");
	}
	return parseUsage(payload);
}
