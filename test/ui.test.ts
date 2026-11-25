import { describe, expect, it } from "bun:test";

import { statusCard } from "../extensions/claude-oauth/commands";
import { type CardTheme, renderClaudeCard } from "../extensions/claude-oauth/ui";

const theme: CardTheme = {
  bold: (text) => `<b>${text}</b>`,
  fg: (color, text) => `<${color}>${text}</>`,
  bg: (_color, text) => text,
};

const options = { expanded: false, keyText: () => "", keyHint: () => "" };
const render = (data: unknown): string =>
  renderClaudeCard({ data }, options, theme).render(120).join("\n");

describe("renderClaudeCard", () => {
  it("renders the title and toned lines", () => {
    const output = render(
      statusCard({
        configured: true,
        source: "stored",
        envToken: false,
        modelCount: 18,
        activeModel: "claude-opus-5-5",
      }),
    );

    expect(output).toContain("<b>Claude (Pro/Max/Ultra)</b>");
    expect(output).toContain("<success>Signed in via saved credential</>");
    expect(output).toContain("<accent>Active model: claude-opus-5-5</>");
  });

  it("renders plain lines without a tone", () => {
    const output = render({ title: "Claude", lines: [{ text: "plain" }], timestamp: 0 });
    expect(output).toContain("plain");
  });

  it("degrades gracefully without data", () => {
    expect(render(undefined)).toContain("<dim>Claude status unavailable</>");
  });

  it.each([
    '{"title":"Older card"}',
    '{"title":"Older card","lines":[{"text":"ok"},null]}',
    '{"title":"Older card","lines":[{"text":"ok","tone":"retired"}]}',
    '{"title":4,"lines":[]}',
  ])("falls back for incompatible saved data: %s", (saved) => {
    expect(render(JSON.parse(saved))).toContain("<dim>Claude status unavailable</>");
  });
});
