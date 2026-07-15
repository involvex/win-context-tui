/**
 * Pre-mutation registry backups via `reg export`.
 */

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

function timestampDirName(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function backupRoot(): string {
  const local =
    process.env.LOCALAPPDATA ??
    join(process.env.USERPROFILE ?? ".", "AppData", "Local");
  return join(local, "win-context-tui", "backups");
}

/** Probe whether a registry key exists (`reg query`). */
export async function keyExists(key: string): Promise<boolean> {
  const result = await spawn("reg", ["query", key]);
  return result.ok;
}

/**
 * Export `key` to a timestamped backup folder under LOCALAPPDATA.
 * If the key is missing, records `existed: false` so restore can delete.
 */
export async function createBackup(key: string): Promise<BackupResult> {
  const backupDir = join(backupRoot(), timestampDirName());
  await mkdir(backupDir, { recursive: true });

  const existed = await keyExists(key);
  const safeName = key.replaceAll("\\", "_").replaceAll(".", "_");
  const regFileName = `${safeName}.reg`;
  const regPath = join(backupDir, regFileName);

  let exportResult: RegResult | null = null;
  let regFile: string | null = null;

  if (existed) {
    exportResult = await spawn("reg", ["export", key, regPath, "/y"]);
    if (!exportResult.ok) {
      throw new Error(
        `Backup failed for ${key}: ${exportResult.stderr || exportResult.stdout}`,
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
): Promise<{ backupDir: string; result: RegResult; meta: BackupMeta }> {
  const backup = await createBackup(key);
  const result = await mutate();
  return {
    backupDir: backup.backupDir,
    result,
    meta: backup.meta,
  };
}
