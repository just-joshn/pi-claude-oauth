import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../package.json" with { type: "json" };

const npm = process.env.npm_execpath;
assert.ok(npm, "Run this script through npm run test:package");
const cwd = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "pi-package-"));
const host = `@earendil-works/pi-coding-agent@${manifest.devDependencies["@earendil-works/pi-coding-agent"]}`;

try {
	execFileSync(process.execPath, [npm, "pack", "--ignore-scripts", "--pack-destination", temp], {
		cwd,
		stdio: "inherit",
		timeout: 60_000,
	});
	const tarballs = readdirSync(temp).filter((file) => file.endsWith(".tgz"));
	assert.equal(tarballs.length, 1, "Expected exactly one packed tarball");
	const tarball = tarballs[0];
	assert.ok(tarball);
	writeFileSync(join(temp, "package.json"), '{"private":true,"type":"module"}\n', { mode: 0o600 });
	execFileSync(
		process.execPath,
		[
			npm,
			"install",
			"--ignore-scripts",
			"--omit=dev",
			"--no-audit",
			"--no-fund",
			"--save-exact",
			host,
			join(temp, tarball),
		],
		{ cwd: temp, stdio: "inherit", timeout: 180_000 },
	);
	copyFileSync(resolve(cwd, "scripts/smoke-installed.ts"), join(temp, "smoke-installed.ts"));
	execFileSync(process.execPath, [join(temp, "smoke-installed.ts"), manifest.name], {
		cwd: temp,
		stdio: "inherit",
		timeout: 30_000,
		env: {
			PATH: process.env.PATH,
			HOME: temp,
			USERPROFILE: temp,
			SystemRoot: process.env.SystemRoot,
			TEMP: temp,
			TMP: temp,
			PI_OFFLINE: "1",
			PI_CODING_AGENT_DIR: join(temp, ".pi-agent"),
		},
	});
} finally {
	rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
}
