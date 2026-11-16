/**
 * Context-menu registry targets: file selected vs folder vs empty background.
 */

import { sanitizeShellKeyName } from "./paths.ts";

/**
 * Where the verb appears in Explorer:
 * - file: right-click a file (`*\shell`) — `"%1"` is the file path
 * - directory: right-click a folder (`Directory\shell`) — `"%1"` is the folder
 * - background: right-click empty space (`Directory\Background\shell`) — `"%V"` is cwd
 */
export type ContextTarget = "file" | "directory" | "background";

/** Backing registry hive for a static context-menu entry. */
export type RegistryScope = "machine" | "user";

export const CONTEXT_TARGETS: Array<{
  id: ContextTarget;
  label: string;
  hint: string;
  defaultArg: string;
}> = [
  {
    id: "file",
    label: "File selected (*\\shell)",
    hint: "Right-click a file in Explorer",
    defaultArg: '"%1"',
  },
  {
    id: "directory",
    label: "Folder selected (Directory\\shell)",
    hint: "Right-click a folder",
    defaultArg: '"%1"',
  },
  {
    id: "background",
    label: "Folder background (Directory\\Background\\shell)",
    hint: "Right-click empty space inside a folder",
    defaultArg: '"%V"',
  },
];

/** Explicit backing-store root for a context target and registry scope. */
export function shellRootForTarget(
  target: ContextTarget,
  scope: RegistryScope,
): string {
  const hive = scope === "machine" ? "HKLM" : "HKCU";
  const classesRoot = `${hive}\\Software\\Classes`;

  switch (target) {
    case "file":
      return `${classesRoot}\\*\\shell`;
    case "directory":
      return `${classesRoot}\\Directory\\shell`;
    case "background":
      return `${classesRoot}\\Directory\\Background\\shell`;
  }
}

const UNSAFE_BACKING_ENTRY_NAME = /[<>:"/\\|?*]/;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint <= 0x1f;
  });
}

function validateBackingEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Shell entry name is empty");
  }
  if (trimmed === "." || trimmed === "..") {
    throw new Error("Shell entry name must not be a path segment");
  }
  if (UNSAFE_BACKING_ENTRY_NAME.test(name) || hasControlCharacter(name)) {
    throw new Error("Shell entry name contains unsafe path characters");
  }
  return name;
}

/** Exact backing-store key for one static context-menu entry. */
export function backingShellKeyForTarget(
  target: ContextTarget,
  scope: RegistryScope,
  name: string,
): string {
  const exactName = validateBackingEntryName(name);
  return `${shellRootForTarget(target, scope)}\\${exactName}`;
}

export function shellKeyForTarget(target: ContextTarget, name: string): string {
  const safe = sanitizeShellKeyName(name);
  switch (target) {
    case "file":
      return `HKCR\\*\\shell\\${safe}`;
    case "directory":
      return `HKCR\\Directory\\shell\\${safe}`;
    case "background":
      return `HKCR\\Directory\\Background\\shell\\${safe}`;
  }
}

export function defaultArgForTarget(target: ContextTarget): string {
  const found = CONTEXT_TARGETS.find((t) => t.id === target);
  return found?.defaultArg ?? '"%1"';
}
