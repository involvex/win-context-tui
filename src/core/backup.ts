/**
 * Pre-mutation registry backups via `reg export`.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn, type RegResult } from "./spawn.ts";

export type BackupMeta = {
  key: string;
  existed: boolean;
  createdAt: string;
  regFile: string | null;
};

export type BackupResult = {
  backupDir: string;
  meta: BackupMeta;
  exportResult: RegResult | null;
};

/** A mutation failure that occurred after its backup was created successfully. */
export class BackupMutationError extends Error {
  readonly backupDir: string;
  readonly meta: BackupMeta;

  constructor(backupDir: string, meta: BackupMeta, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Registry mutation failed after backup creation: ${detail}`, {
      cause,
    });
    this.name = "BackupMutationError";
    this.backupDir = backupDir;
    this.meta = meta;
  }
}

/** Injectable seam for running `reg.exe` without touching the live registry. */
export type RegistryCommandRunner = (args: string[]) => Promise<RegResult>;

export type BackupOptions = {
  /** Reject the mutation when the key does not exist. */
  requireExisting?: boolean;
  /** Injectable `reg.exe` command runner. */
  runner?: RegistryCommandRunner;
  /** Override the backup root, primarily for isolated tests. */
  backupRoot?: string;
};

const defaultRegistryRunner: RegistryCommandRunner = (args) =>
  spawn("reg", args);

const REGISTRY_EXPORT_FILE_NAME = "registry-entry.reg";

function defaultBackupRoot(): string {
  const local =
    process.env.LOCALAPPDATA ??
    join(process.env.USERPROFILE ?? ".", "AppData", "Local");
  return join(local, "win-context-tui", "backups");
}

function processFailureDetails(result: RegResult): string {
  return [`exit code ${result.code}`, result.stderr, result.stdout]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

async function queryKey(
  key: string,
  runner: RegistryCommandRunner,
): Promise<RegResult> {
  return runner(["query", key]);
}

/** Probe whether a registry key exists (`reg query`). */
export async function keyExists(
  key: string,
  runner: RegistryCommandRunner = defaultRegistryRunner,
): Promise<boolean> {
  const result = await queryKey(key, runner);
  return result.ok;
}

/**
 * Export `key` to a unique backup folder under LOCALAPPDATA.
 * If the key is missing, records `existed: false` so restore can delete.
 */
export async function createBackup(
  key: string,
  options: BackupOptions = {},
): Promise<BackupResult> {
  const runner = options.runner ?? defaultRegistryRunner;
  const root = options.backupRoot ?? defaultBackupRoot();
  const backupDir = join(root, randomUUID());
  await mkdir(root, { recursive: true });
  await mkdir(backupDir);

  const queryResult = await queryKey(key, runner);
  const existed = queryResult.ok;
  if (!existed && options.requireExisting) {
    throw new Error(
      `Backup failed for ${key}: required-key query failed\n${processFailureDetails(queryResult)}`,
    );
  }

  const regPath = join(backupDir, REGISTRY_EXPORT_FILE_NAME);
  let exportResult: RegResult | null = null;
  let regFile: string | null = null;

  if (existed) {
    exportResult = await runner(["export", key, regPath, "/y"]);
    if (!exportResult.ok) {
      throw new Error(
        `Backup failed for ${key}: ${processFailureDetails(exportResult)}`,
      );
    }
    regFile = regPath;
  } else {
    await writeFile(
      join(backupDir, "STUB.txt"),
      `Key did not exist before edit.\nKey: ${key}\nRestore by deleting this key.\n`,
      "utf8",
    );
  }

  const meta: BackupMeta = {
    key,
    existed,
    createdAt: new Date().toISOString(),
    regFile,
  };

  await writeFile(
    join(backupDir, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );

  return { backupDir, meta, exportResult };
}

/**
 * Create a backup of `key`, then run `mutate`.
 * Mutation only runs after a successful backup (or missing-key note).
 */
export async function withBackup(
  key: string,
  mutate: () => Promise<RegResult>,
  options: BackupOptions = {},
): Promise<{ backupDir: string; result: RegResult; meta: BackupMeta }> {
  const backup = await createBackup(key, options);
  let result: RegResult;
  try {
    result = await mutate();
  } catch (error) {
    throw new BackupMutationError(backup.backupDir, backup.meta, error);
  }
  return {
    backupDir: backup.backupDir,
    result,
    meta: backup.meta,
  };
}
