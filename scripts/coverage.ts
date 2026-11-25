import { spawn } from "node:child_process";
import { glob, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SOURCE_GLOB = "src/**/*.ts";
const MINIMUM_PERCENT = 80;

function run(args: readonly string[]): Promise<number> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.once("error", fail);
    child.once("close", (code) => done(code ?? 1));
  });
}

async function checkCoverage(dir: string): Promise<number> {
  const lcov = join(dir, "lcov.info");
  const exitCode = await run([
    "--test",
    "--experimental-test-coverage",
    `--test-coverage-include=${SOURCE_GLOB}`,
    `--test-coverage-lines=${MINIMUM_PERCENT}`,
    `--test-coverage-functions=${MINIMUM_PERCENT}`,
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=lcov",
    `--test-reporter-destination=${lcov}`,
    ...process.argv.slice(2),
  ]);
  if (exitCode !== 0) return exitCode;

  const reported = new Set(
    (await readFile(lcov, "utf8"))
      .split("\n")
      .filter((line) => line.startsWith("SF:"))
      .map((line) => resolve(line.slice(3).trim())),
  );
  const missing: string[] = [];
  for await (const file of glob(SOURCE_GLOB)) {
    if (!reported.has(resolve(file))) missing.push(file);
  }
  if (missing.length) {
    missing.sort((a, b) => a.localeCompare(b));
    process.stderr.write(
      `Coverage did not load these source files:\n${missing.map((file) => `  ${file}`).join("\n")}\n`,
    );
    return 1;
  }
  return 0;
}

const dir = await mkdtemp(join(tmpdir(), "claude-oauth-coverage-"));
try {
  process.exitCode = await checkCoverage(dir);
} finally {
  await rm(dir, { recursive: true, force: true });
}
