import { describe, expect, test } from "bun:test";
import { sanitizeTerminalText } from "../src/ui/sanitize.ts";

describe("sanitizeTerminalText", () => {
  test("removes OSC hyperlink and title sequences", () => {
    expect(
      sanitizeTerminalText(
        "\u001B]8;;https://evil.example\u0007Visible link\u001B]8;;\u0007",
      ),
    ).toBe("Visible link");
    expect(sanitizeTerminalText("\u001B]0;Window title\u0007Visible")).toBe(
      "Visible",
    );
  });

  test("removes CSI color and cursor sequences", () => {
    expect(sanitizeTerminalText("\u001B[31mRed\u001B[0m")).toBe("Red");
    expect(sanitizeTerminalText("\u001B[2J\u001B[HText")).toBe("Text");
  });

  test("preserves ordinary Unicode text", () => {
    expect(sanitizeTerminalText("Öffnen mit Codex 🧪 café")).toBe(
      "Öffnen mit Codex 🧪 café",
    );
  });

  test("removes control characters", () => {
    expect(sanitizeTerminalText("safe\u0000\u0007\u0008\u000Btext")).toBe(
      "safetext",
    );
    expect(sanitizeTerminalText("line one\nline two\tend")).toBe(
      "line oneline twoend",
    );
    expect(sanitizeTerminalText("\u009B31mC1\u009B0m")).toBe("C1");
  });
});
