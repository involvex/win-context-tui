/**
 * Built-in app presets for context-menu commands.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import type { ContextTarget } from "./targets.ts";

export type AppPreset = {
  id: string;
  /** Select-menu label */
  title: string;
  /** Registry shell key name */
  name: string;
  /** Context-menu display text */
  menuLabel: string;
  /** Candidate absolute exe paths (first existing wins) */
  candidates: string[];
  /** Args template per target; use {path} placeholder for quoted path */
  args: Record<ContextTarget, string>;
};

function localAppData(): string {
  return (
    process.env.LOCALAPPDATA ??
    join(process.env.USERPROFILE ?? "C:\\Users\\Default", "AppData", "Local")
  );
}

function programFiles(): string {
  return process.env.ProgramFiles ?? "C:\\Program Files";
}

function programFilesX86(): string {
  return process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
}

export const APP_PRESETS: AppPreset[] = [
  {
    id: "cursor",
    title: "Cursor",
    name: "OpenCursor",
    menuLabel: "Open with Cursor",
    candidates: [
      join(localAppData(), "Programs", "cursor", "Cursor.exe"),
      join(localAppData(), "Programs", "Cursor", "Cursor.exe"),
    ],
    args: {
      file: '"%1"',
      directory: '"%1"',
      background: '"%V"',
    },
  },
  {
    id: "vscode",
    title: "Visual Studio Code",
    name: "OpenVSCode",
    menuLabel: "Open with Code",
    candidates: [
      join(localAppData(), "Programs", "Microsoft VS Code", "Code.exe"),
      join(programFiles(), "Microsoft VS Code", "Code.exe"),
      join(programFilesX86(), "Microsoft VS Code", "Code.exe"),
    ],
    args: {
      file: '"%1"',
      directory: '"%1"',
      background: '"%V"',
    },
  },
  {
    id: "vscode-insiders",
    title: "VS Code Insiders",
    name: "OpenVSCodeInsiders",
    menuLabel: "Open with Code Insiders",
    candidates: [
      join(
        localAppData(),
        "Programs",
        "Microsoft VS Code Insiders",
        "Code - Insiders.exe",
      ),
      join(programFiles(), "Microsoft VS Code Insiders", "Code - Insiders.exe"),
    ],
    args: {
      file: '"%1"',
      directory: '"%1"',
      background: '"%V"',
    },
  },
  {
    id: "windows-terminal",
    title: "Windows Terminal",
    name: "OpenWindowsTerminal",
    menuLabel: "Open in Windows Terminal",
    candidates: [
      join(localAppData(), "Microsoft", "WindowsApps", "wt.exe"),
      join(programFiles(), "Windows Terminal", "wt.exe"),
    ],
    args: {
      // wt -d <dir>; for a file, open parent via cmd trick is awkward — use dir path
      file: '-d "%W"',
      directory: '-d "%1"',
      background: '-d "%V"',
    },
  },
  {
    id: "powershell",
    title: "PowerShell",
    name: "OpenPowerShell",
    menuLabel: "Open PowerShell here",
    candidates: [
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
    ],
    args: {
      file: "-NoExit -Command \"Set-Location -LiteralPath '%W'\"",
      directory: "-NoExit -Command \"Set-Location -LiteralPath '%1'\"",
      background: "-NoExit -Command \"Set-Location -LiteralPath '%V'\"",
    },
  },
  {
    id: "pwsh",
    title: "PowerShell 7 (pwsh)",
    name: "OpenPwsh",
    menuLabel: "Open pwsh here",
    candidates: [
      join(programFiles(), "PowerShell", "7", "pwsh.exe"),
      join(programFiles(), "PowerShell", "7-preview", "pwsh.exe"),
    ],
    args: {
      file: "-NoExit -Command \"Set-Location -LiteralPath '%W'\"",
      directory: "-NoExit -Command \"Set-Location -LiteralPath '%1'\"",
      background: "-NoExit -Command \"Set-Location -LiteralPath '%V'\"",
    },
  },
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolve first existing exe for a preset, or null if none found. */
export async function resolvePresetExe(
  preset: AppPreset,
): Promise<string | null> {
  for (const candidate of preset.candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function findPreset(id: string): AppPreset | undefined {
  return APP_PRESETS.find((p) => p.id === id);
}
