import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const packageName = process.argv[2];
assert.ok(packageName, "Expected the installed package name");
const version = process.argv[3];
assert.ok(version, "Expected the host version");

const cwd = process.cwd();
const packageDir = resolve(cwd, "node_modules", packageName);
const packageRequire = createRequire(join(packageDir, "package.json"));
for (const name of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"]) {
	const paths = packageRequire.resolve.paths(name);
	assert.ok(paths, `Cannot resolve ${name} from ${packageName}`);
	const manifestPath = paths.map((path) => join(path, name, "package.json")).find((path) => existsSync(path));
	assert.ok(manifestPath, `Cannot find ${name} from ${packageName}`);
	const installed: { version: string } = JSON.parse(readFileSync(manifestPath, "utf8"));
	assert.equal(installed.version, version, `${name} resolved from ${packageName} must be ${version}`);
}
process.stdout.write(`Verified package host dependencies at ${version}.\n`);
const loader = new DefaultResourceLoader({
	cwd,
	agentDir: resolve(cwd, ".pi-agent"),
	settingsManager: SettingsManager.inMemory(),
	additionalExtensionPaths: [packageDir],
	noExtensions: true,
	noSkills: true,
	noPromptTemplates: true,
	noThemes: true,
	noContextFiles: true,
});

await loader.reload();
const result = loader.getExtensions();
assert.deepEqual(result.errors, [], `Packed extension must load without errors: ${JSON.stringify(result.errors)}`);
assert.equal(result.extensions.length, 1, "Expected exactly one packed extension entry");
process.stdout.write("Packed extension loaded through Pi.\n");
