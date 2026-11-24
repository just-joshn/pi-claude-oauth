import { describe, expect, it } from "vitest";
import { renderClaudeCard, type CardTheme } from "../extensions/claude-oauth/ui";
import { statusCard } from "../extensions/claude-oauth/commands";

const theme: CardTheme = {
  bold: (text) => `<b>${text}</b>`,
  fg: (color, text) => `<${color}>${text}</>`,
  bg: (_color, text) => text,
};

const render = (data: Parameters<typeof renderClaudeCard>[0]): string => renderClaudeCard(data, theme).render(120).join("\n");

describe("renderClaudeCard", () => {
  it("renders the title and toned lines", () => {
    const output = render(
      statusCard({ configured: true, source: "stored", envToken: false, modelCount: 18, activeModel: "claude-opus-5-5" }),
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
});
