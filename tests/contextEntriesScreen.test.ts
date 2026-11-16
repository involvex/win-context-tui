import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextEntry } from "../src/core/contextEntries.ts";
import { removeContextEntry } from "../src/core/registry.ts";
import {
  contextEntriesKeyAction,
  contextEntriesListView,
  contextEntriesRemovalFailureOutcome,
  contextEntriesTransition,
  contextEntrySelectItems,
  evaluateRemovalElevation,
  formatCommandOrHandler,
  formatEntryListLabel,
  formatEntryMetadataDetails,
  formatHandlerDetails,
  formatScopeLabel,
} from "../src/ui/ContextEntriesScreen.tsx";
import { resolveStatusEscapeHint } from "../src/ui/Status.tsx";

const machineEntry: ContextEntry = {
  name: "Shared",
  label: "Machine shared",
  labelData: {
    defaultValue: "Machine shared",
    muiVerb: null,
    source: "default",
    isResourceReference: false,
  },
  scope: "machine",
  registryPath: "HKLM\\Software\\Classes\\*\\shell\\Shared",
  command: null,
  delegateExecute: null,
  handlerKind: "metadata",
};

describe("formatScopeLabel", () => {
  test("labels user and machine scopes explicitly", () => {
    expect(formatScopeLabel("user")).toBe("User");
    expect(formatScopeLabel("machine")).toBe("Machine");
  });
});

describe("handler formatting", () => {
  test("shows the command when one is available", () => {
    expect(
      formatCommandOrHandler({
        command: '"C:\\Tools\\app.exe" "%1"',
        delegateExecute: null,
        handlerKind: "command",
      }),
    ).toBe('Command: "C:\\Tools\\app.exe" "%1"');
  });

  test("shows command and delegate values without hiding either", () => {
    const entry = {
      command: "tool.exe",
      delegateExecute: "{shell.ext}",
      handlerKind: "command+delegate" as const,
    };

    expect(formatHandlerDetails(entry)).toEqual([
      "Command: tool.exe",
      "DelegateExecute: {shell.ext}",
    ]);
    expect(formatCommandOrHandler(entry)).toBe(
      "Command: tool.exe\nDelegateExecute: {shell.ext}",
    );
  });

  test("shows the delegate value or metadata-only handler", () => {
    expect(
      formatHandlerDetails({
        command: null,
        delegateExecute: "{shell.ext}",
        handlerKind: "delegate",
      }),
    ).toEqual(["DelegateExecute: {shell.ext}"]);
    expect(
      formatHandlerDetails({
        command: null,
        delegateExecute: null,
        handlerKind: "metadata",
      }),
    ).toEqual(["Handler: metadata"]);
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
      labelData: {
        defaultValue: "User shared",
        muiVerb: null,
        source: "default",
        isResourceReference: false,
      },
      scope: "user",
      registryPath: "HKCU\\Software\\Classes\\*\\shell\\Shared",
      command: "user-tool.exe",
      delegateExecute: null,
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

describe("contextEntriesRemovalFailureOutcome", () => {
  test("surfaces the backup directory when deletion rejects after export", async () => {
    const backupRoot = await mkdtemp(
      join(tmpdir(), "win-context-ui-backup-test-"),
    );
    const runner = async (args: string[]) => {
      if (args[0] === "export") {
        await writeFile(
          args[2] as string,
          "Windows Registry Editor Version 5.00",
        );
        return { ok: true, code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "delete") {
        throw new Error("delete runner rejected");
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };

    let caught: unknown;
    try {
      await removeContextEntry(
        { target: "file", scope: "user", name: "Rejecting Entry" },
        { runner, backupRoot },
      );
    } catch (error) {
      caught = error;
    } finally {
      await rm(backupRoot, { recursive: true, force: true });
    }

    const outcome = contextEntriesRemovalFailureOutcome(caught, machineEntry);

    expect(outcome).toEqual({
      ok: false,
      message: 'Failed to remove "Machine shared"',
      detail: "delete runner rejected",
      backupDir: expect.any(String),
    });
  });

  test("does not invent a backup directory for a pre-backup failure", () => {
    const outcome = contextEntriesRemovalFailureOutcome(
      new Error("required-key query failed"),
      machineEntry,
    );

    expect(outcome.backupDir).toBeUndefined();
    expect(outcome.message).toBe(
      'Failed to back up or remove "Machine shared"',
    );
    expect(outcome.detail).toBe("required-key query failed");
  });
});

describe("context entry labels", () => {
  test("shows both handler kinds and unresolved MUIVerb references", () => {
    const entry: ContextEntry = {
      name: "IndirectVerb",
      label: "@shell32.dll,-100",
      labelData: {
        defaultValue: "Fallback",
        muiVerb: "@shell32.dll,-100",
        source: "muiVerb",
        isResourceReference: true,
      },
      scope: "user",
      registryPath: "HKCU\\Software\\Classes\\*\\shell\\IndirectVerb",
      command: "tool.exe",
      delegateExecute: "{shell.ext}",
      handlerKind: "command+delegate",
    };

    const label = formatEntryListLabel(entry);

    expect(label).toContain("@shell32.dll,-100");
    expect(label).toContain("unresolved MUIVerb resource reference");
    expect(label).toContain("command + delegate");
  });

  test("sanitizes registry-derived labels, names, commands, delegates, and metadata", () => {
    const entry: ContextEntry = {
      name: "\u001B[31mName\u001B[0m",
      label: "\u001B]8;;https://evil.example\u0007Label\u001B]8;;\u0007",
      labelData: {
        defaultValue: "\u001B[32mDefault\u001B[0m",
        muiVerb: "\u001B]0;Title\u0007@shell32.dll,-100",
        source: "muiVerb",
        isResourceReference: true,
      },
      scope: "user",
      registryPath:
        "HKCU\\Software\\Classes\\*\\shell\\\u001B[33mName\u001B[0m",
      command: "\u001B[34mtool.exe\u001B[0m",
      delegateExecute:
        "\u001B]8;;https://evil.example\u0007{shell.ext}\u001B]8;;\u0007",
      handlerKind: "command+delegate",
    };

    const rendered = [
      formatEntryListLabel(entry),
      ...formatHandlerDetails(entry),
      ...formatEntryMetadataDetails(entry),
    ].join("\n");

    expect(rendered).not.toContain("\u001B");
    expect(rendered).toContain("Label");
    expect(rendered).toContain("Name");
    expect(rendered).toContain("Default");
    expect(rendered).toContain("@shell32.dll,-100");
    expect(rendered).toContain("tool.exe");
    expect(rendered).toContain("{shell.ext}");
  });

  test("labels metadata-only entries as metadata", () => {
    expect(formatEntryListLabel(machineEntry)).toContain("metadata");
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
