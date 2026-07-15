/**
 * Path and registry-key helpers for Windows context-menu edits.
 */

/** Normalize a file extension to `.ext` (lowercase). */
export function normalizeExtension(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Extension is empty");
  }
  const withoutDot = trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
  if (!/^[a-z0-9]+([.+_-]?[a-z0-9]+)*$/i.test(withoutDot)) {
    throw new Error(`Invalid extension: ${raw}`);
  }
  return `.${withoutDot}`;
}

/** Shell-safe ProgID for an extension (e.g. `.json` → `wincontext.json`). */
export function progIdForExtension(ext: string): string {
  const normalized = normalizeExtension(ext);
  return `wincontext${normalized}`;
}

/** Friendly type label for ShellNew entries. */
export function friendlyTypeName(ext: string): string {
  const normalized = normalizeExtension(ext);
  const label = normalized.slice(1).toUpperCase();
  return `${label} File`;
}

/**
 * Quote an executable path and optional args for a registry command value.
 * Example: `"C:\\Program Files\\Cursor\\Cursor.exe" "%V"`
 */
export function quoteCommand(exePath: string, args = "%V"): string {
  const exe = exePath.trim().replaceAll('"', "");
  if (!exe) {
    throw new Error("Executable path is empty");
  }
  const argPart = args.trim();
  return argPart ? `"${exe}" ${argPart}` : `"${exe}"`;
}

/** Sanitize a registry shell key name (no backslashes). */
export function sanitizeShellKeyName(name: string): string {
  const cleaned = name.trim().replace(/[\\/]/g, "_");
  if (!cleaned) {
    throw new Error("Shell key name is empty");
  }
  return cleaned;
}

/** HKCR path for a file-extension key. */
export function extensionKey(ext: string): string {
  return `HKCR\\${normalizeExtension(ext)}`;
}
