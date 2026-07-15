/**
 * Windows registry helpers for ShellNew and context menus.
 * Uses `reg.exe` via Bun.spawn — no native bindings.
 */

import { withBackup, type BackupMeta } from "./backup.ts";
import {
  extensionKey,
  friendlyTypeName,
  normalizeExtension,
  progIdForExtension,
  quoteCommand,
  sanitizeShellKeyName,
} from "./paths.ts";
import { spawn, type RegResult } from "./spawn.ts";
import {
  defaultArgForTarget,
  shellKeyForTarget,
  type ContextTarget,
} from "./targets.ts";

export type { RegResult } from "./spawn.ts";
export type { ContextTarget } from "./targets.ts";

export type MutateOutcome = {
  backupDir: string;
  result: RegResult;
  meta: BackupMeta;
};

export async function reg(args: string[]): Promise<RegResult> {
  return spawn("reg", args);
}

async function ensureProgId(ext: string): Promise<RegResult> {
  const normalized = normalizeExtension(ext);
  const key = extensionKey(normalized);
  const progId = progIdForExtension(normalized);
  const friendly = friendlyTypeName(normalized);

  const setDefault = await reg([
    "add",
    key,
    "/ve",
    "/t",
    "REG_SZ",
    "/d",
    progId,
    "/f",
  ]);
  if (!setDefault.ok) {
    return setDefault;
  }

  const progKey = `HKCR\\${progId}`;
  return reg(["add", progKey, "/ve", "/t", "REG_SZ", "/d", friendly, "/f"]);
}

/**
 * Add an extension to the Explorer "New" menu via ShellNew + NullFile.
 */
export async function addShellNew(ext: string): Promise<MutateOutcome> {
  const normalized = normalizeExtension(ext);
  const key = extensionKey(normalized);
  const shellNewKey = `${key}\\ShellNew`;

  return withBackup(key, async () => {
    const prog = await ensureProgId(normalized);
    if (!prog.ok) {
      return prog;
    }

    return reg([
      "add",
      shellNewKey,
      "/v",
      "NullFile",
      "/t",
      "REG_SZ",
      "/d",
      "",
      "/f",
    ]);
  });
}

export type ContextCommandOptions = {
  target: ContextTarget;
  /** Registry key name under the target shell hive */
  name: string;
  /** Display label in the context menu */
  label: string;
  /** Absolute path to the executable */
  command: string;
  /** Command-line args; defaults depend on target (%1 / %V) */
  args?: string;
};

/**
 * Add a custom command to a context-menu target
 * (file selected, folder selected, or folder background).
 */
export async function addContextCommand(
  opts: ContextCommandOptions,
): Promise<MutateOutcome> {
  const name = sanitizeShellKeyName(opts.name);
  const key = shellKeyForTarget(opts.target, name);
  const commandKey = `${key}\\command`;
  const args = opts.args ?? defaultArgForTarget(opts.target);
  const commandValue = quoteCommand(opts.command, args);
  const label = opts.label.trim() || name;

  return withBackup(key, async () => {
    const setLabel = await reg([
      "add",
      key,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      label,
      "/f",
    ]);
    if (!setLabel.ok) {
      return setLabel;
    }

    return reg([
      "add",
      commandKey,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      commandValue,
      "/f",
    ]);
  });
}

/** @deprecated Use addContextCommand({ target: "background", ... }) */
export async function addBackgroundCommand(
  opts: Omit<ContextCommandOptions, "target">,
): Promise<MutateOutcome> {
  return addContextCommand({ ...opts, target: "background" });
}
