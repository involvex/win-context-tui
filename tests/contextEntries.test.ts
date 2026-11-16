import { describe, expect, test } from "bun:test";
import {
  listContextEntries,
  mergeContextEntries,
  parseContextEntries,
  queryRegistryEntries,
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
          command: {
            default: '"C:\\Tools\\codex.exe" "%1"',
            delegateExecute: null,
          },
        },
      ]),
    );

    expect(entries).toEqual([
      {
        name: "Öffnen mit Codex",
        label: "Öffnen mit Codex 🧪",
        labelData: {
          defaultValue: "Öffnen mit Codex 🧪",
          muiVerb: null,
          source: "default",
          isResourceReference: false,
        },
        scope: "user",
        registryPath: "HKCU\\Software\\Classes\\*\\shell\\Öffnen mit Codex",
        command: '"C:\\Tools\\codex.exe" "%1"',
        delegateExecute: null,
        handlerKind: "command",
      },
    ]);
  });

  test("treats empty and whitespace-only PowerShell output as no entries", () => {
    expect(parseContextEntries("machine", machineRoot, "")).toEqual([]);
    expect(parseContextEntries("machine", machineRoot, "  \n")).toEqual([]);
  });

  test("exposes delegate-only, command-plus-delegate, command-only, and metadata-only handlers", () => {
    const entries = parseContextEntries(
      "machine",
      machineRoot,
      JSON.stringify([
        {
          name: "DelegateOnly",
          default: "Delegate only",
          muiVerb: null,
          command: {
            default: null,
            delegateExecute: "{shell.ext}",
          },
        },
        {
          name: "CommandAndDelegate",
          default: "Command and delegate",
          muiVerb: null,
          command: {
            default: "tool.exe",
            delegateExecute: "{shell.ext}",
          },
        },
        {
          name: "CommandOnly",
          default: "Command only",
          muiVerb: null,
          command: {
            default: "tool.exe",
            delegateExecute: null,
          },
        },
        {
          name: "MetadataOnly",
          default: "Metadata only",
          muiVerb: null,
          command: null,
        },
      ]),
    );

    expect(
      entries.map((entry) => ({
        command: entry.command,
        delegateExecute: entry.delegateExecute,
        handlerKind: entry.handlerKind,
      })),
    ).toEqual([
      {
        command: null,
        delegateExecute: "{shell.ext}",
        handlerKind: "delegate",
      },
      {
        command: "tool.exe",
        delegateExecute: "{shell.ext}",
        handlerKind: "command+delegate",
      },
      {
        command: "tool.exe",
        delegateExecute: null,
        handlerKind: "command",
      },
      {
        command: null,
        delegateExecute: null,
        handlerKind: "metadata",
      },
    ]);
  });

  test("keeps indirect MUIVerb references distinguishable from default labels", () => {
    const entries = parseContextEntries(
      "user",
      userRoot,
      JSON.stringify([
        {
          name: "IndirectLabel",
          default: "Fallback label",
          muiVerb: "@%SystemRoot%\\system32\\shell32.dll,-100",
          command: {
            default: null,
            delegateExecute: null,
          },
        },
      ]),
    );

    expect(entries[0]?.label).toBe("@%SystemRoot%\\system32\\shell32.dll,-100");
    expect(entries[0]?.labelData).toEqual({
      defaultValue: "Fallback label",
      muiVerb: "@%SystemRoot%\\system32\\shell32.dll,-100",
      source: "muiVerb",
      isResourceReference: true,
    });
  });

  test("rejects malformed JSON", () => {
    expect(() =>
      parseContextEntries("machine", machineRoot, "{broken"),
    ).toThrow("Invalid context-entry JSON");
  });

  test.each(["[null]", "[[]]", "[42]"])(
    "rejects malformed array shape %s",
    (payload) => {
      expect(() =>
        parseContextEntries("machine", machineRoot, payload),
      ).toThrow("Invalid context-entry JSON: entry must be an object");
    },
  );
});

describe("mergeContextEntries", () => {
  test("gives user scope precedence for same-name entries", () => {
    const machineEntries: ContextEntry[] = [
      {
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
      },
      {
        name: "MachineOnly",
        label: "Machine only",
        labelData: {
          defaultValue: "Machine only",
          muiVerb: null,
          source: "default",
          isResourceReference: false,
        },
        scope: "machine",
        registryPath: "HKLM\\Software\\Classes\\*\\shell\\MachineOnly",
        command: null,
        delegateExecute: null,
        handlerKind: "metadata",
      },
    ];
    const userEntries: ContextEntry[] = [
      {
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
      },
      {
        name: "UserOnly",
        label: "User only",
        labelData: {
          defaultValue: "User only",
          muiVerb: null,
          source: "default",
          isResourceReference: false,
        },
        scope: "user",
        registryPath: "HKCU\\Software\\Classes\\*\\shell\\UserOnly",
        command: null,
        delegateExecute: null,
        handlerKind: "metadata",
      },
    ];

    expect(mergeContextEntries(machineEntries, userEntries)).toEqual([
      machineEntries[1],
      userEntries[1],
      userEntries[0],
    ]);
  });

  test("gives user scope precedence for same-name entries with different casing", () => {
    const machineEntry: ContextEntry = {
      name: "SharedVerb",
      label: "Machine shared",
      labelData: {
        defaultValue: "Machine shared",
        muiVerb: null,
        source: "default",
        isResourceReference: false,
      },
      scope: "machine",
      registryPath: "HKLM\\Software\\Classes\\*\\shell\\SharedVerb",
      command: null,
      delegateExecute: null,
      handlerKind: "metadata",
    };
    const userEntry: ContextEntry = {
      name: "sharedverb",
      label: "User shared",
      labelData: {
        defaultValue: "User shared",
        muiVerb: null,
        source: "default",
        isResourceReference: false,
      },
      scope: "user",
      registryPath: "HKCU\\Software\\Classes\\*\\shell\\sharedverb",
      command: "user-tool.exe",
      delegateExecute: null,
      handlerKind: "command",
    };

    expect(mergeContextEntries([machineEntry], [userEntry])).toEqual([
      userEntry,
    ]);
  });

  test("orders entries with equal labels by entry name", () => {
    const zuluEntry: ContextEntry = {
      name: "Zulu",
      label: "Same label",
      labelData: {
        defaultValue: "Same label",
        muiVerb: null,
        source: "default",
        isResourceReference: false,
      },
      scope: "machine",
      registryPath: "HKLM\\Software\\Classes\\*\\shell\\Zulu",
      command: null,
      delegateExecute: null,
      handlerKind: "metadata",
    };
    const alphaEntry: ContextEntry = {
      name: "Alpha",
      label: "Same label",
      labelData: {
        defaultValue: "Same label",
        muiVerb: null,
        source: "default",
        isResourceReference: false,
      },
      scope: "user",
      registryPath: "HKCU\\Software\\Classes\\*\\shell\\Alpha",
      command: null,
      delegateExecute: null,
      handlerKind: "metadata",
    };

    expect(mergeContextEntries([zuluEntry], [alphaEntry])).toEqual([
      alphaEntry,
      zuluEntry,
    ]);
  });
});

describe("queryRegistryEntries", () => {
  test("reads DelegateExecute from the command subkey", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    await queryRegistryEntries("user", userRoot, async (command, args) => {
      calls.push({ command, args });
      return { ok: true, code: 0, stdout: "[]", stderr: "" };
    });

    expect(calls).toHaveLength(1);
    const encodedScript = calls[0]?.args.at(-1);
    expect(encodedScript).toBeDefined();
    const script = Buffer.from(encodedScript as string, "base64").toString(
      "utf16le",
    );
    expect(script).toContain("$commandKey.GetValue('DelegateExecute')");
    expect(script).not.toContain("$key.GetValue('DelegateExecute')");
  });
});

describe("listContextEntries", () => {
  test("queries machine and user scopes concurrently", async () => {
    let activeQueries = 0;
    let maxActiveQueries = 0;
    const runner: ContextEntriesRunner = async () => {
      activeQueries += 1;
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
      await Promise.resolve();
      activeQueries -= 1;
      return "[]";
    };

    const result = await listContextEntries("file", runner);

    expect(maxActiveQueries).toBe(2);
    expect(result).toEqual({ entries: [], warnings: [] });
  });

  test("assembles scope warnings in machine-then-user order", async () => {
    const runner: ContextEntriesRunner = async (scope) => {
      if (scope === "user") {
        throw new Error("user scope failed");
      }
      await Promise.resolve();
      throw new Error("machine scope failed");
    };

    const result = await listContextEntries("file", runner);

    expect(result.warnings).toEqual([
      { scope: "machine", message: "machine scope failed" },
      { scope: "user", message: "user scope failed" },
    ]);
  });

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
