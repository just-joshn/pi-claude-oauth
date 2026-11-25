import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

import claudeExtension from "../src/index.ts";

await it("registers the Claude provider, command, and card renderer with Pi", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-extension-smoke-"));
  try {
    const loader = new DefaultResourceLoader({
      cwd: dir,
      agentDir: dir,
      settingsManager: SettingsManager.inMemory(),
      extensionFactories: [claudeExtension],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });

    await loader.reload();
    const { errors, extensions, runtime } = loader.getExtensions();
    deepStrictEqual(errors, []);
    strictEqual(extensions.length, 1);
    strictEqual(extensions[0]?.commands.has("claude"), true);
    strictEqual(extensions[0]?.entryRenderers?.has("claude-card"), true);
    deepStrictEqual(
      runtime.pendingNativeProviderRegistrations.map(({ provider }) => provider.id),
      ["claude"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
