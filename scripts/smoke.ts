import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as wait } from "node:timers/promises";

import { isRecord } from "../src/oauth.ts";

type Rpc = Record<string, unknown>;

const cwd = await mkdtemp(join(tmpdir(), "claude-smoke-"));
const child = spawn(
  process.env["PI_BIN"] ?? "pi",
  [
    "--mode",
    "rpc",
    "--offline",
    "--no-session",
    "--no-approve",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-mcp",
    "-e",
    join(import.meta.dirname, "..", "src", "index.ts"),
  ],
  {
    cwd,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: join(cwd, "agent"),
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-smoke",
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
let stderr = "";
child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
const responses = new Map<string, (response: Rpc) => void>();
createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => {
  const item = record(line);
  if (item?.["type"] === "response" && typeof item["id"] === "string") {
    responses.get(item["id"])?.(item);
  }
});
const exited = new Promise<string>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve(String(code ?? signal)));
});
const failed = exited.then((status) => {
  throw new Error(`Pi exited (${status}) before the smoke test finished: ${stderr}`);
});

function record(json: string): Rpc | undefined {
  try {
    const value: unknown = JSON.parse(json);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function list(data: unknown, key: string): Rpc[] {
  const items = isRecord(data) ? data[key] : undefined;
  assert(Array.isArray(items), `Pi returned no ${key}`);
  return items.filter(isRecord);
}

async function rpc(id: string, type: string, fields: Rpc = {}): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const request = new Promise<Rpc>((resolve) => {
      responses.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ id, type, ...fields })}\n`);
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`RPC timeout: ${type}\n${stderr}`)), 20_000);
    });
    const response = await Promise.race([request, failed, timeout]);
    assert(response["success"], JSON.stringify(response));
    return response["data"];
  } finally {
    clearTimeout(timer);
    responses.delete(id);
  }
}

function cardLines(entries: Rpc[]): unknown[] {
  const card = entries.findLast((entry) => entry["customType"] === "claude-card");
  const data = card?.["data"];
  return isRecord(data) && Array.isArray(data["lines"]) ? data["lines"] : [];
}

child.stdin.on("error", () => {});
try {
  const commands = list(await rpc("1", "get_commands"), "commands");
  assert(
    commands.some((command) => command["name"] === "claude"),
    "Pi did not register /claude",
  );

  const models = list(await rpc("2", "get_available_models"), "models");
  const claude = models.filter((model) => model["provider"] === "claude");
  assert(claude.length > 0, "Pi lists no available claude models");
  assert.equal(claude[0]?.["id"], "claude-opus-5-5");

  await rpc("3", "prompt", { message: "/claude status" });
  const lines = cardLines(list(await rpc("4", "get_entries"), "entries"));
  assert(
    lines.some((line) => isRecord(line) && line["text"] === "Signed in via environment token"),
    `Unexpected /claude status card: ${JSON.stringify(lines)}`,
  );

  process.stdout.write(
    `Real Pi RPC smoke passed: /claude, ${claude.length} claude models, env-token status (no network).\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  const exit = exited.catch(() => {});
  await Promise.race([exit, wait(1000, undefined, { ref: false })]);
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  await exit;
  await rm(cwd, { recursive: true, force: true });
}
