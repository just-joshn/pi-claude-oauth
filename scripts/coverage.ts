import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SOURCE_GLOB = "src/**/*.ts";

async function checkCoverage(dir: string): Promise<number> {
  const run = Bun.spawnSync(
    [
      "bun",
      "test",
      "--coverage",
      "--coverage-reporter=text",
      "--coverage-reporter=lcov",
      `--coverage-dir=${dir}`,
      ...Bun.argv.slice(2),
    ],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  if (run.exitCode !== 0) return run.exitCode ?? 1;

  const reported = new Set(
    (await readFile(join(dir, "lcov.info"), "utf8"))
      .split("\n")
      .filter((line) => line.startsWith("SF:"))
      .map((line) => resolve(line.slice(3).trim())),
  );
  const missing = [...new Bun.Glob(SOURCE_GLOB).scanSync()]
    .filter((file) => !reported.has(resolve(file)))
    .toSorted((a, b) => a.localeCompare(b));
  if (missing.length) {
    console.error(
      `Coverage did not load these source files:\n${missing.map((file) => `  ${file}`).join("\n")}`,
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
