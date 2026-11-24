import { CLAUDE_OAUTH_BETA, ClaudeAuthError, isRecord, type FetchLike } from "./oauth";

export const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

const DEFAULT_TIMEOUT_MS = 15_000;

const BUCKETS = [
  ["five_hour", "5-hour window"],
  ["seven_day", "7-day window"],
  ["seven_day_opus", "7-day Opus"],
  ["seven_day_sonnet", "7-day Sonnet"],
] as const;

export interface UsageBucket {
  readonly label: string;
  readonly utilization: number;
  readonly resetsAt?: string;
}

export interface UsageReport {
  readonly buckets: readonly UsageBucket[];
}

export interface FetchUsageOptions {
  readonly signal: AbortSignal;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

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

  if (buckets.length === 0) {
    throw new ClaudeAuthError("Claude reported no usage windows for this account.");
  }
  return { buckets };
}

export function formatResetTime(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
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

export async function fetchUsage(accessToken: string, options: FetchUsageOptions): Promise<UsageReport> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(CLAUDE_USAGE_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "anthropic-beta": CLAUDE_OAUTH_BETA,
        "x-app": "cli",
      },
      signal: AbortSignal.any([options.signal, timeout]),
    });
  } catch (error) {
    if (options.signal.aborted) throw new ClaudeAuthError("Claude usage lookup was cancelled.", { cause: error });
    if (timeout.aborted) throw new ClaudeAuthError("Claude did not answer the usage request in time.", { cause: error });
    throw new ClaudeAuthError(`Could not reach ${CLAUDE_USAGE_URL}.`, { cause: error });
  }

  if (response.status === 401 || response.status === 403) {
    throw new ClaudeAuthError(
      `Claude rejected the saved token for usage lookup (HTTP ${response.status}). Run \`/login claude\` again.`,
    );
  }
  if (!response.ok) {
    throw new ClaudeAuthError(`Claude usage lookup failed (HTTP ${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ClaudeAuthError("Claude returned usage data that was not valid JSON.");
  }
  return parseUsage(payload);
}
