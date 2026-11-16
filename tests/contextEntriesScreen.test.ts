import { describe, expect, test } from "bun:test";
import type { ContextEntry } from "../src/core/contextEntries.ts";
import {
  contextEntrySelectItems,
  evaluateRemovalElevation,
  formatCommandOrHandler,
  formatScopeLabel,
} from "../src/ui/ContextEntriesScreen.tsx";

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
    const machineEntry: ContextEntry = {
      name: "Shared",
      label: "Machine shared",
      scope: "machine",
      registryPath: "HKLM\\Software\\Classes\\*\\shell\\Shared",
      command: null,
      handlerKind: "metadata",
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
