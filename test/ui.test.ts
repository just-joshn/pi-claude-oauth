import { ok } from "node:assert/strict";
import { describe, it } from "node:test";

import { statusCard } from "../src/commands.ts";
import { type CardTheme, renderClaudeCard } from "../src/ui.ts";

const theme: CardTheme = {
  bold: (text) => `<b>${text}</b>`,
  fg: (color, text) => `<${color}>${text}</>`,
  bg: (_color, text) => text,
};

const options = { expanded: false, keyText: () => "", keyHint: () => "" };
const render = (data: unknown): string =>
  renderClaudeCard({ data }, options, theme).render(120).join("\n");

await describe("renderClaudeCard", async () => {
  await it("renders the title and toned lines", () => {
    const output = render(
      statusCard({
        configured: true,
        source: "stored",
        envToken: false,
        modelCount: 18,
        activeModel: "claude-opus-5-5",
      }),
    );

    ok(output.includes("<b>Claude (Pro/Max/Ultra)</b>"));
    ok(output.includes("<success>Signed in via saved credential</>"));
    ok(output.includes("<accent>Active model: claude-opus-5-5</>"));
  });

  await it("renders plain lines without a tone", () => {
    const output = render({ title: "Claude", lines: [{ text: "plain" }], timestamp: 0 });
    ok(output.includes("plain"));
  });

  await it("degrades gracefully without data", () => {
    ok(render(undefined).includes("<dim>Claude status unavailable</>"));
  });

  for (const saved of [
    '{"title":"Older card"}',
    '{"title":"Older card","lines":[{"text":"ok"},null]}',
    '{"title":"Older card","lines":[{"text":"ok","tone":"retired"}]}',
    '{"title":4,"lines":[]}',
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Registering a test inside a suite resolves immediately.
    await it(`falls back for incompatible saved data: ${saved}`, () => {
      const data: unknown = JSON.parse(saved);
      ok(render(data).includes("<dim>Claude status unavailable</>"));
    });
  }
});
