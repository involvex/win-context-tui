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
