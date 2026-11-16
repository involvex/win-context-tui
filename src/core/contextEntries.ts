import { spawn } from "./spawn.ts";
import {
  shellRootForTarget,
  type ContextTarget,
  type RegistryScope,
} from "./targets.ts";

export type ContextEntryHandlerKind = "command" | "delegate" | "metadata";

export type ContextEntry = {
  name: string;
  label: string;
  scope: RegistryScope;
  registryPath: string;
  command: string | null;
  handlerKind: ContextEntryHandlerKind;
};

export type ContextEntryWarning = {
  scope: RegistryScope;
  message: string;
};

export type ListContextEntriesResult = {
  entries: ContextEntry[];
  warnings: ContextEntryWarning[];
};

/** Injectable read-only query seam used by listContextEntries. */
export type ContextEntriesRunner = (
  scope: RegistryScope,
  root: string,
) => Promise<string>;

type RawContextEntry = {
  name?: unknown;
  default?: unknown;
  muiVerb?: unknown;
  command?: unknown;
  delegateExecute?: unknown;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value;
}

function isRawContextEntry(value: unknown): value is RawContextEntry {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEntriesValue(value: unknown): RawContextEntry[] {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (!isRawContextEntry(entry)) {
        throw new Error("Invalid context-entry JSON: entry must be an object");
      }
      return entry;
    });
  }
  if (isRawContextEntry(value)) {
    return [value];
  }
  throw new Error("Invalid context-entry JSON: expected an object or array");
}

/** Parse one scope's PowerShell JSON output into typed context entries. */
export function parseContextEntries(
  scope: RegistryScope,
  root: string,
  output: string,
): ContextEntry[] {
  const normalizedOutput = output.replace(/^\uFEFF/, "").trim();
  if (!normalizedOutput) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedOutput);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid context-entry JSON: ${detail}`);
  }

  return parseEntriesValue(parsed).map((raw) => {
    if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
      throw new Error("Invalid context-entry JSON: entry name is missing");
    }

    const name = raw.name;
    const label =
      nonEmptyString(raw.muiVerb) ?? nonEmptyString(raw.default) ?? name;
    const command = nonEmptyString(raw.command);
    const delegateExecute = nonEmptyString(raw.delegateExecute);
    const handlerKind: ContextEntryHandlerKind = command
      ? "command"
      : delegateExecute
        ? "delegate"
        : "metadata";

    return {
      name,
      label,
      scope,
      registryPath: `${root}\\${name}`,
      command,
      handlerKind,
    };
  });
}

function compareText(left: string, right: string): number {
  const foldedLeft = left.toLowerCase();
  const foldedRight = right.toLowerCase();
  if (foldedLeft < foldedRight) {
    return -1;
  }
  if (foldedLeft > foldedRight) {
    return 1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function entryKey(name: string): string {
  return name.toLowerCase();
}

/** Merge machine and user entries with HKCR-style user precedence. */
export function mergeContextEntries(
  machineEntries: ContextEntry[],
  userEntries: ContextEntry[],
): ContextEntry[] {
  const merged = new Map<string, ContextEntry>();

  for (const entry of machineEntries) {
    merged.set(entryKey(entry.name), entry);
  }
  for (const entry of userEntries) {
    merged.set(entryKey(entry.name), entry);
  }

  return [...merged.values()].sort((left, right) => {
    const byLabel = compareText(left.label, right.label);
    return byLabel !== 0 ? byLabel : compareText(left.name, right.name);
  });
}

function powerShellLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function registryProviderPath(scope: RegistryScope, root: string): string {
  const hive = scope === "machine" ? "HKEY_LOCAL_MACHINE" : "HKEY_CURRENT_USER";
  const rootPrefix = scope === "machine" ? "HKLM\\" : "HKCU\\";
  if (!root.startsWith(rootPrefix)) {
    throw new Error(`Registry root ${root} does not match scope ${scope}`);
  }
  return `Registry::${hive}\\${root.slice(rootPrefix.length)}`;
}

function registryQueryScript(scope: RegistryScope, root: string): string {
  const providerRoot = registryProviderPath(scope, root);
  return [
    "$ErrorActionPreference = 'Stop'",
    "$utf8 = [System.Text.UTF8Encoding]::new($false)",
    "[Console]::OutputEncoding = $utf8",
    "$OutputEncoding = $utf8",
    `$root = '${powerShellLiteral(providerRoot)}'`,
    "if (-not (Test-Path -LiteralPath $root)) {",
    "  [Console]::Out.Write('[]')",
    "  exit 0",
    "}",
    "$entries = @(",
    "  Get-ChildItem -LiteralPath $root -ErrorAction Stop |",
    "    Where-Object { $_.PSIsContainer } |",
    "    ForEach-Object {",
    "      $key = $_",
    "      $default = $key.GetValue('')",
    "      $muiVerb = $key.GetValue('MUIVerb')",
    "      $delegateExecute = $key.GetValue('DelegateExecute')",
    "      $command = $null",
    "      $commandPath = Join-Path -Path $key.PSPath -ChildPath 'command'",
    "      if (Test-Path -LiteralPath $commandPath) {",
    "        $commandKey = Get-Item -LiteralPath $commandPath -ErrorAction Stop",
    "        $command = $commandKey.GetValue('')",
    "      }",
    "      [PSCustomObject]@{",
    "        name = $key.PSChildName",
    "        default = $default",
    "        muiVerb = $muiVerb",
    "        command = $command",
    "        delegateExecute = $delegateExecute",
    "      }",
    "    }",
    ")",
    "[Console]::Out.Write((ConvertTo-Json -InputObject $entries -Compress -Depth 3))",
  ].join("\n");
}

/** Query one explicit scope with the Windows PowerShell Registry provider. */
export async function queryRegistryEntries(
  scope: RegistryScope,
  root: string,
): Promise<string> {
  const script = registryQueryScript(scope, root);
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const result = await spawn("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodedScript,
  ]);

  if (!result.ok) {
    const detail = result.stderr || result.stdout || "PowerShell query failed";
    throw new Error(`Registry query failed for ${root}: ${detail}`);
  }
  return result.stdout;
}

/** List static shell verbs from both explicit backing scopes. */
export async function listContextEntries(
  target: ContextTarget,
  runner: ContextEntriesRunner = queryRegistryEntries,
): Promise<ListContextEntriesResult> {
  const queryScope = async (scope: RegistryScope) => {
    const root = shellRootForTarget(target, scope);
    try {
      const output = await runner(scope, root);
      return {
        scope,
        entries: parseContextEntries(scope, root, output),
        warning: null,
      };
    } catch (error) {
      return {
        scope,
        entries: [] as ContextEntry[],
        warning: {
          scope,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };

  const [machineResult, userResult] = await Promise.all([
    queryScope("machine"),
    queryScope("user"),
  ]);
  const warnings = [machineResult.warning, userResult.warning].filter(
    (warning): warning is ContextEntryWarning => warning !== null,
  );

  return {
    entries: mergeContextEntries(machineResult.entries, userResult.entries),
    warnings,
  };
}
