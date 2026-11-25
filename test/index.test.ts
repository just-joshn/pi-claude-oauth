import { expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

import claudeExtension from "../src/index";

it("registers the Claude provider, command, and card renderer with Pi", async () => {
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
    expect(errors).toEqual([]);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]?.commands.has("claude")).toBe(true);
    expect(extensions[0]?.entryRenderers?.has("claude-card")).toBe(true);
    expect(runtime.pendingNativeProviderRegistrations.map(({ provider }) => provider.id)).toEqual([
      "claude",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
