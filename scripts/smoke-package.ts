import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../package.json" with { type: "json" };

const npm = process.env.npm_execpath;
assert.ok(npm, "Run this script through npm run test:package");
const cwd = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "pi-package-"));
const explicitTarball = process.argv[2];
const hostVersions = ["1.6.0", manifest.devDependencies["@earendil-works/pi-coding-agent"]];
const hostPackages = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"];

try {
	let tarball: string;
	if (explicitTarball !== undefined) {
		tarball = resolve(explicitTarball);
		assert.ok(tarball.endsWith(".tgz"), `Expected a .tgz path: ${tarball}`);
		assert.ok(existsSync(tarball), `Tarball not found: ${tarball}`);
	} else {
		execFileSync(process.execPath, [npm, "pack", "--ignore-scripts", "--pack-destination", temp], {
			cwd,
			stdio: "inherit",
			timeout: 60_000,
		});
		const tarballs = readdirSync(temp).filter((file) => file.endsWith(".tgz"));
		assert.equal(tarballs.length, 1, "Expected exactly one packed tarball");
		const packed = tarballs[0];
		assert.ok(packed);
		tarball = join(temp, packed);
	}
	for (const version of hostVersions) {
		const installDir = join(temp, version);
		mkdirSync(installDir);
		writeFileSync(join(installDir, "package.json"), '{"private":true,"type":"module"}\n', { mode: 0o600 });
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
				...hostPackages.map((name) => `${name}@${version}`),
				tarball,
			],
			{ cwd: installDir, stdio: "inherit", timeout: 180_000 },
		);
		copyFileSync(resolve(cwd, "scripts/smoke-installed.ts"), join(installDir, "smoke-installed.ts"));
		execFileSync(process.execPath, [join(installDir, "smoke-installed.ts"), manifest.name, version], {
			cwd: installDir,
			stdio: "inherit",
			timeout: 30_000,
			env: {
				PATH: process.env.PATH,
				HOME: installDir,
				USERPROFILE: installDir,
				SystemRoot: process.env.SystemRoot,
				TEMP: installDir,
				TMP: installDir,
				PI_OFFLINE: "1",
				PI_CODING_AGENT_DIR: join(installDir, ".pi-agent"),
			},
		});
	}
} finally {
	rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
}
