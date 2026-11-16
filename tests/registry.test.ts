import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  removeContextEntry,
  type RemoveContextEntryOptions,
} from "../src/core/registry.ts";
import { createBackup, withBackup } from "../src/core/backup.ts";
import type { RegResult } from "../src/core/spawn.ts";

type RegistryCommandRunner = (args: string[]) => Promise<RegResult>;

const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "win-context-registry-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("removeContextEntry input validation", () => {
  test.each([
    { description: "a forward-slash path", name: "folder/child" },
    { description: "a backslash path", name: "folder\\child" },
    { description: "a dot-dot path", name: "..\\OtherEntry" },
  ])(
    "rejects $description before running a registry command",
    async ({ name }) => {
      const calls: string[][] = [];
      const runner: RegistryCommandRunner = async (args) => {
        calls.push(args);
        return { ok: true, code: 0, stdout: "", stderr: "" };
      };
      const options: RemoveContextEntryOptions = {
        target: "file",
        scope: "user",
        name,
      };

      await expect(
        removeContextEntry(options, {
          runner,
          backupRoot: await createTemporaryRoot(),
        }),
      ).rejects.toThrow("Shell entry name");
      expect(calls).toEqual([]);
    },
  );
});

describe("backup safety options", () => {
  test("keeps the missing-key stub behavior used by existing add flows", async () => {
    const calls: string[][] = [];
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      return {
        ok: false,
        code: 1,
        stdout: "query stdout",
        stderr: "query stderr: key missing",
      };
    };
    let mutated = false;
    const key = "HKCU\\Software\\Classes\\Directory\\shell\\New Entry";

    const outcome = await withBackup(
      key,
      async () => {
        mutated = true;
        return { ok: true, code: 0, stdout: "", stderr: "" };
      },
      { runner, backupRoot: await createTemporaryRoot() },
    );

    expect(mutated).toBe(true);
    expect(calls).toEqual([["query", key]]);
    expect(outcome.meta).toMatchObject({ key, existed: false, regFile: null });
    expect(
      await readFile(join(outcome.backupDir, "STUB.txt"), "utf8"),
    ).toContain("Key did not exist before edit.");
  });

  test("does not run the mutation when require-existing finds no key", async () => {
    const calls: string[][] = [];
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      return {
        ok: false,
        code: 1,
        stdout: "query stdout",
        stderr: "query stderr: key missing",
      };
    };
    let mutated = false;
    const key = "HKCU\\Software\\Classes\\Directory\\shell\\Missing Entry";

    await expect(
      withBackup(
        key,
        async () => {
          mutated = true;
          return { ok: true, code: 0, stdout: "", stderr: "" };
        },
        {
          requireExisting: true,
          runner,
          backupRoot: await createTemporaryRoot(),
        },
      ),
    ).rejects.toThrow("required-key query failed");
    expect(mutated).toBe(false);
    expect(calls).toEqual([["query", key]]);
  });

  test("reports an access-denied required-key query with complete process details", async () => {
    const runner: RegistryCommandRunner = async () => ({
      ok: false,
      code: 5,
      stdout: "query stdout",
      stderr: "Access is denied.",
    });
    const key = "HKLM\\Software\\Classes\\Directory\\shell\\Protected Entry";

    const backup = withBackup(
      key,
      async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      {
        requireExisting: true,
        runner,
        backupRoot: await createTemporaryRoot(),
      },
    );

    await expect(backup).rejects.toThrow("required-key query failed");
    await expect(backup).rejects.toThrow("exit code 5");
    await expect(backup).rejects.toThrow("Access is denied.");
    await expect(backup).rejects.toThrow("query stdout");
  });
});

describe("backup artifacts", () => {
  test("keeps the export path writable for a maximum-length entry name", async () => {
    const entryName = "x".repeat(255);
    const calls: string[][] = [];
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      if (args[0] === "export") {
        await writeFile(
          args[2] as string,
          "Windows Registry Editor Version 5.00",
        );
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };
    const backupRoot = await createTemporaryRoot();

    const outcome = await removeContextEntry(
      { target: "directory", scope: "user", name: entryName },
      { runner, backupRoot },
    );
    const exportCall = calls.find((args) => args[0] === "export");
    const exportPath = exportCall?.[2];

    expect(exportPath).toBeDefined();
    expect(basename(exportPath as string)).toBe("registry-entry.reg");
    expect(basename(exportPath as string).length).toBeLessThanOrEqual(255);
    expect(outcome.meta.key).toBe(
      `HKCU\\Software\\Classes\\Directory\\shell\\${entryName}`,
    );
    expect(outcome.meta.regFile).toBe(exportPath);
  });

  test("keeps concurrent sibling backups in distinct directories and exports", async () => {
    const root = "HKCU\\Software\\Classes\\Directory\\shell";
    const keys = [`${root}\\foo.bar`, `${root}\\foo_bar`];
    const runner: RegistryCommandRunner = async (args) => {
      if (args[0] === "export") {
        await writeFile(args[2] as string, args[1] as string);
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };
    const backupRoot = await createTemporaryRoot();

    setSystemTime(new Date("2026-11-16T12:00:00.000Z"));
    let backups: Awaited<ReturnType<typeof createBackup>>[];
    try {
      backups = await Promise.all(
        keys.map((key) => createBackup(key, { runner, backupRoot })),
      );
    } finally {
      setSystemTime();
    }
    const [first, second] = backups;

    expect(first?.backupDir).not.toBe(second?.backupDir);
    expect(first?.meta.regFile).not.toBe(second?.meta.regFile);
    expect(await readFile(first?.meta.regFile as string, "utf8")).toBe(keys[0]);
    expect(await readFile(second?.meta.regFile as string, "utf8")).toBe(
      keys[1],
    );
  });
});

describe("removeContextEntry scoped deletion", () => {
  test("aborts without deleting when the selected key does not exist", async () => {
    const calls: string[][] = [];
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      if (args[0] === "query") {
        return {
          ok: false,
          code: 1,
          stdout: "query stdout",
          stderr: "query stderr: key missing",
        };
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };
    const expectedKey = "HKCU\\Software\\Classes\\*\\shell\\Missing Entry";

    const removal = removeContextEntry(
      { target: "file", scope: "user", name: "Missing Entry" },
      { runner, backupRoot: await createTemporaryRoot() },
    );
    await expect(removal).rejects.toThrow("query stderr: key missing");
    await expect(removal).rejects.toThrow("query stdout");
    expect(calls).toEqual([["query", expectedKey]]);
  });

  test("aborts without deleting when the required backup export fails", async () => {
    const calls: string[][] = [];
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      if (args[0] === "export") {
        return {
          ok: false,
          code: 1,
          stdout: "export stdout",
          stderr: "export stderr: denied",
        };
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };
    const expectedKey = "HKCU\\Software\\Classes\\*\\shell\\Open in Codex";

    const removal = removeContextEntry(
      { target: "file", scope: "user", name: "Open in Codex" },
      { runner, backupRoot: await createTemporaryRoot() },
    );
    await expect(removal).rejects.toThrow("export stderr: denied");
    await expect(removal).rejects.toThrow("export stdout");
    expect(calls.map((args) => args[0])).toEqual(["query", "export"]);
    expect(calls[0]).toEqual(["query", expectedKey]);
    expect(calls[1]?.slice(0, 2)).toEqual(["export", expectedKey]);
  });

  test("exports the selected key successfully before deleting it", async () => {
    const calls: string[][] = [];
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      if (args[0] === "export") {
        await writeFile(
          args[2] as string,
          "Windows Registry Editor Version 5.00",
        );
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };
    const backupRoot = await createTemporaryRoot();
    const expectedKey =
      "HKLM\\Software\\Classes\\Directory\\shell\\Open in Codex";

    const outcome = await removeContextEntry(
      { target: "directory", scope: "machine", name: "Open in Codex" },
      { runner, backupRoot },
    );

    expect(calls.map((args) => args[0])).toEqual(["query", "export", "delete"]);
    expect(calls[0]).toEqual(["query", expectedKey]);
    expect(calls[1]?.slice(0, 2)).toEqual(["export", expectedKey]);
    expect(calls[2]).toEqual(["delete", expectedKey, "/f"]);
    expect(outcome.backupDir.startsWith(backupRoot)).toBe(true);
    expect(outcome.meta).toMatchObject({ key: expectedKey, existed: true });
    expect(outcome.meta.regFile?.startsWith(backupRoot)).toBe(true);
  });

  test("returns delete process details without treating them as success", async () => {
    const calls: string[][] = [];
    const deleteFailure: RegResult = {
      ok: false,
      code: 5,
      stdout: "delete stdout",
      stderr: "delete stderr: access denied",
    };
    const runner: RegistryCommandRunner = async (args) => {
      calls.push(args);
      if (args[0] === "export") {
        await writeFile(
          args[2] as string,
          "Windows Registry Editor Version 5.00",
        );
        return { ok: true, code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "delete") {
        return deleteFailure;
      }
      return { ok: true, code: 0, stdout: "", stderr: "" };
    };

    const outcome = await removeContextEntry(
      { target: "file", scope: "user", name: "Open in Codex" },
      { runner, backupRoot: await createTemporaryRoot() },
    );

    expect(calls.map((args) => args[0])).toEqual(["query", "export", "delete"]);
    expect(outcome.result).toEqual(deleteFailure);
  });

  test.each([
    {
      target: "file" as const,
      scope: "machine" as const,
      expected: "HKLM\\Software\\Classes\\*\\shell\\Open in Codex",
    },
    {
      target: "file" as const,
      scope: "user" as const,
      expected: "HKCU\\Software\\Classes\\*\\shell\\Open in Codex",
    },
    {
      target: "directory" as const,
      scope: "user" as const,
      expected: "HKCU\\Software\\Classes\\Directory\\shell\\Open in Codex",
    },
    {
      target: "background" as const,
      scope: "machine" as const,
      expected:
        "HKLM\\Software\\Classes\\Directory\\Background\\shell\\Open in Codex",
    },
  ])(
    "deletes only the exact $scope $target entry key",
    async ({ target, scope, expected }) => {
      const calls: string[][] = [];
      const runner: RegistryCommandRunner = async (args) => {
        calls.push(args);
        return { ok: true, code: 0, stdout: "", stderr: "" };
      };

      await removeContextEntry(
        { target, scope, name: "Open in Codex" },
        { runner, backupRoot: await createTemporaryRoot() },
      );

      expect(calls.filter((args) => args[0] === "delete")).toEqual([
        ["delete", expected, "/f"],
      ]);
    },
  );
});
