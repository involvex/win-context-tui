/**
 * Admin / elevation detection and restart-as-admin (RunAs).
 */

import { spawn } from "./spawn.ts";

/**
 * Returns true when the current process has elevated (Administrator) rights.
 * Uses `net session`, which fails for non-admin users.
 */
export async function isAdmin(): Promise<boolean> {
  const result = await spawn("net", ["session"]);
  return result.ok;
}

/**
 * Relaunch this app elevated via PowerShell Start-Process -Verb RunAs,
 * then exit the current (non-elevated) process.
 */
export async function restartAsAdmin(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (await isAdmin()) {
    return { ok: false, error: "Already running elevated" };
  }

  const bunPath = process.execPath;
  const entry = Bun.main;
  const cwd = process.cwd();

  const q = (s: string) => s.replaceAll("'", "''");

  const ps = [
    `Start-Process -FilePath '${q(bunPath)}'`,
    `-ArgumentList @('${q(entry)}')`,
    `-WorkingDirectory '${q(cwd)}'`,
    `-Verb RunAs`,
    `-ErrorAction Stop`,
  ].join(" ");

  const result = await spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    ps,
  ]);

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.stderr ||
        result.stdout ||
        "UAC prompt cancelled or elevation failed",
    };
  }

  return { ok: true };
}
