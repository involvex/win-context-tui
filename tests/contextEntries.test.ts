import { describe, expect, test } from "bun:test";
import {
  listContextEntries,
  mergeContextEntries,
  parseContextEntries,
  type ContextEntriesRunner,
  type ContextEntry,
} from "../src/core/contextEntries.ts";

const userRoot = "HKCU\\Software\\Classes\\*\\shell";
const machineRoot = "HKLM\\Software\\Classes\\*\\shell";

describe("parseContextEntries", () => {
  test("parses registry metadata while preserving Unicode labels", () => {
    const entries = parseContextEntries(
      "user",
      userRoot,
      JSON.stringify([
        {
          name: "Öffnen mit Codex",
          default: "Öffnen mit Codex 🧪",
          muiVerb: null,
          command: '"C:\\Tools\\codex.exe" "%1"',
          delegateExecute: null,
        },
      ]),
    );

    expect(entries).toEqual([
      {
        name: "Öffnen mit Codex",
        label: "Öffnen mit Codex 🧪",
        scope: "user",
        registryPath: "HKCU\\Software\\Classes\\*\\shell\\Öffnen mit Codex",
        command: '"C:\\Tools\\codex.exe" "%1"',
        handlerKind: "command",
      },
    ]);
  });

  test("treats empty and whitespace-only PowerShell output as no entries", () => {
    expect(parseContextEntries("machine", machineRoot, "")).toEqual([]);
    expect(parseContextEntries("machine", machineRoot, "  \n")).toEqual([]);
  });

  test("handles default, MUIVerb, command, delegate, and metadata-only variants", () => {
    const entries = parseContextEntries(
      "machine",
      machineRoot,
      JSON.stringify([
        {
          name: "DefaultLabel",
          default: "Default label",
          muiVerb: null,
          command: "tool.exe",
          delegateExecute: null,
        },
        {
          name: "MuiLabel",
          default: "Default label",
          muiVerb: "MUI label",
          command: null,
          delegateExecute: "{shell.ext}",
        },
        {
          name: "MetadataOnly",
          default: null,
          muiVerb: null,
          command: null,
          delegateExecute: null,
        },
      ]),
    );

    expect(entries.map((entry) => entry.label)).toEqual([
      "Default label",
      "MUI label",
      "MetadataOnly",
    ]);
    expect(entries.map((entry) => entry.handlerKind)).toEqual([
      "command",
      "delegate",
      "metadata",
    ]);
  });

  test("rejects malformed JSON", () => {
    expect(() =>
      parseContextEntries("machine", machineRoot, "{broken"),
    ).toThrow("Invalid context-entry JSON");
  });
});

describe("mergeContextEntries", () => {
  test("gives user scope precedence for same-name entries", () => {
    const machineEntries: ContextEntry[] = [
      {
        name: "Shared",
        label: "Machine shared",
        scope: "machine",
        registryPath: "HKLM\\Software\\Classes\\*\\shell\\Shared",
        command: null,
        handlerKind: "metadata",
      },
      {
        name: "MachineOnly",
        label: "Machine only",
        scope: "machine",
        registryPath: "HKLM\\Software\\Classes\\*\\shell\\MachineOnly",
        command: null,
        handlerKind: "metadata",
      },
    ];
    const userEntries: ContextEntry[] = [
      {
        name: "Shared",
        label: "User shared",
        scope: "user",
        registryPath: "HKCU\\Software\\Classes\\*\\shell\\Shared",
        command: "user-tool.exe",
        handlerKind: "command",
      },
      {
        name: "UserOnly",
        label: "User only",
        scope: "user",
        registryPath: "HKCU\\Software\\Classes\\*\\shell\\UserOnly",
        command: null,
        handlerKind: "metadata",
      },
    ];

    expect(mergeContextEntries(machineEntries, userEntries)).toEqual([
      machineEntries[1],
      userEntries[1],
      userEntries[0],
    ]);
  });
});

describe("listContextEntries", () => {
  test("queries both explicit scopes and returns a deterministic merged list", async () => {
    const calls: Array<{ scope: string; root: string }> = [];
    const runner: ContextEntriesRunner = async (scope, root) => {
      calls.push({ scope, root });
      if (scope === "machine") {
        return JSON.stringify([
          {
            name: "Shared",
            default: "Machine shared",
            muiVerb: null,
            command: null,
            delegateExecute: null,
          },
        ]);
      }
      return JSON.stringify([
        {
          name: "Shared",
          default: "User shared",
          muiVerb: null,
          command: "user-tool.exe",
          delegateExecute: null,
        },
        {
          name: "Zulu",
          default: "Zulu",
          muiVerb: null,
          command: null,
          delegateExecute: null,
        },
        {
          name: "Alpha",
          default: "Alpha",
          muiVerb: null,
          command: null,
          delegateExecute: null,
        },
      ]);
    };

    const result = await listContextEntries("file", runner);

    expect(calls).toEqual([
      { scope: "machine", root: machineRoot },
      { scope: "user", root: userRoot },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.entries.map((entry) => entry.name)).toEqual([
      "Alpha",
      "Shared",
      "Zulu",
    ]);
    expect(result.entries[1]?.scope).toBe("user");
    expect(result.entries[1]?.registryPath).toBe(
      "HKCU\\Software\\Classes\\*\\shell\\Shared",
    );
  });

  test("keeps readable scope entries and reports a failed scope query", async () => {
    const runner: ContextEntriesRunner = async (scope) => {
      if (scope === "machine") {
        throw new Error("machine scope unavailable");
      }
      return JSON.stringify([
        {
          name: "UserEntry",
          default: "User entry",
          muiVerb: null,
          command: null,
          delegateExecute: null,
        },
      ]);
    };

    const result = await listContextEntries("file", runner);

    expect(result.entries.map((entry) => entry.name)).toEqual(["UserEntry"]);
    expect(result.warnings).toEqual([
      { scope: "machine", message: "machine scope unavailable" },
    ]);
  });
});
