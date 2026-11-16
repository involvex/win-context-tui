import { describe, expect, test } from "bun:test";
import type { ContextEntry } from "../src/core/contextEntries.ts";
import {
  contextEntriesKeyAction,
  contextEntrySelectItems,
  contextEntriesListView,
  contextEntriesTransition,
  evaluateRemovalElevation,
  formatCommandOrHandler,
  formatScopeLabel,
} from "../src/ui/ContextEntriesScreen.tsx";
import { resolveStatusEscapeHint } from "../src/ui/Status.tsx";

const machineEntry: ContextEntry = {
  name: "Shared",
  label: "Machine shared",
  scope: "machine",
  registryPath: "HKLM\\Software\\Classes\\*\\shell\\Shared",
  command: null,
  handlerKind: "metadata",
};

describe("formatScopeLabel", () => {
  test("labels user and machine scopes explicitly", () => {
    expect(formatScopeLabel("user")).toBe("User");
    expect(formatScopeLabel("machine")).toBe("Machine");
  });
});

describe("formatCommandOrHandler", () => {
  test("shows the command when one is available", () => {
    expect(
      formatCommandOrHandler({
        command: '"C:\\Tools\\app.exe" "%1"',
        handlerKind: "command",
      }),
    ).toBe('Command: "C:\\Tools\\app.exe" "%1"');
  });

  test("falls back to the handler kind when no command is available", () => {
    expect(
      formatCommandOrHandler({ command: null, handlerKind: "delegate" }),
    ).toBe("Handler: delegate");
    expect(
      formatCommandOrHandler({ command: null, handlerKind: "metadata" }),
    ).toBe("Handler: metadata");
    expect(
      formatCommandOrHandler({ command: null, handlerKind: "command" }),
    ).toBe("Handler: command");
  });
});

describe("evaluateRemovalElevation", () => {
  test("allows user-scoped removal without elevation", () => {
    expect(evaluateRemovalElevation("user", false)).toEqual({
      allowed: true,
      message: null,
    });
    expect(evaluateRemovalElevation("user", null)).toEqual({
      allowed: true,
      message: null,
    });
  });

  test("allows machine-scoped removal only when elevated", () => {
    expect(evaluateRemovalElevation("machine", true)).toEqual({
      allowed: true,
      message: null,
    });
  });

  test("blocks machine-scoped removal when not elevated or still unknown", () => {
    const notElevated = evaluateRemovalElevation("machine", false);
    const unknown = evaluateRemovalElevation("machine", null);

    expect(notElevated.allowed).toBe(false);
    expect(notElevated.message).toContain("Restart as Administrator");
    expect(unknown.allowed).toBe(false);
    expect(unknown.message).toContain("Restart as Administrator");
  });
});

describe("contextEntrySelectItems", () => {
  test("gives every scoped entry a stable unique React key", () => {
    const userEntry: ContextEntry = {
      name: "Shared",
      label: "User shared",
      scope: "user",
      registryPath: "HKCU\\Software\\Classes\\*\\shell\\Shared",
      command: "user-tool.exe",
      handlerKind: "command",
    };

    const items = contextEntrySelectItems([userEntry, machineEntry]);

    expect(items.map((item) => item.key)).toEqual([
      userEntry.registryPath,
      machineEntry.registryPath,
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(2);
    expect(items[0]?.label).toContain("[User]");
    expect(items[1]?.label).toContain("[Machine]");
  });
});

describe("contextEntriesKeyAction and contextEntriesTransition", () => {
  test.each(["target", "loading", "list"] as const)(
    "Escape returns home from the %s phase",
    (phase) => {
      expect(
        contextEntriesKeyAction(phase, false, "", {
          escape: true,
          return: false,
        }),
      ).toEqual({ type: "escape" });
      expect(
        contextEntriesTransition(phase, false, { type: "escape" }),
      ).toEqual({ type: "return-home" });
    },
  );

  test("list selection enters confirmation", () => {
    expect(
      contextEntriesTransition("list", false, {
        type: "select-entry",
        entry: machineEntry,
      }),
    ).toEqual({ type: "enter-confirmation", entry: machineEntry });
  });

  test("confirmation cancel returns to the list", () => {
    expect(
      contextEntriesKeyAction("confirm", false, "n", {
        escape: false,
        return: false,
      }),
    ).toEqual({ type: "cancel" });
    expect(
      contextEntriesTransition("confirm", false, { type: "cancel" }),
    ).toEqual({ type: "cancel-confirmation" });
    expect(
      contextEntriesTransition("confirm", false, { type: "escape" }),
    ).toEqual({ type: "cancel-confirmation" });
  });

  test("result Enter and Escape return home", () => {
    expect(
      contextEntriesKeyAction("result", false, "", {
        escape: false,
        return: true,
      }),
    ).toEqual({ type: "return-home" });
    expect(
      contextEntriesKeyAction("result", false, "", {
        escape: true,
        return: false,
      }),
    ).toEqual({ type: "escape" });
    expect(
      contextEntriesTransition("result", false, { type: "return-home" }),
    ).toEqual({ type: "return-home" });
    expect(
      contextEntriesTransition("result", false, { type: "escape" }),
    ).toEqual({ type: "return-home" });
  });

  test("busy confirmation ignores Escape and all navigation", () => {
    expect(
      contextEntriesKeyAction("confirm", true, "", {
        escape: true,
        return: false,
      }),
    ).toBeNull();
    expect(
      contextEntriesTransition("confirm", true, { type: "escape" }),
    ).toEqual({ type: "none" });
    expect(
      contextEntriesTransition("confirm", true, { type: "cancel" }),
    ).toEqual({ type: "none" });
    expect(
      contextEntriesTransition("confirm", true, { type: "return-home" }),
    ).toEqual({ type: "none" });
  });
});

describe("contextEntriesListView", () => {
  test("keeps empty and warning state data representable", () => {
    const warning = {
      scope: "user" as const,
      message: "user scope query failed",
    };

    expect(contextEntriesListView([], [warning])).toEqual({
      entries: [],
      warnings: [warning],
      isEmpty: true,
    });
  });
});

describe("resolveStatusEscapeHint", () => {
  test("preserves the existing default and accepts a custom hint", () => {
    expect(resolveStatusEscapeHint()).toBe("Esc to quit");
    expect(resolveStatusEscapeHint("Esc to return to menu")).toBe(
      "Esc to return to menu",
    );
  });
});
