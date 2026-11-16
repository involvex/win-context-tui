import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useEffect, useState } from "react";
import {
  listContextEntries,
  type ContextEntry,
  type ContextEntryWarning,
} from "../core/contextEntries.ts";
import { removeContextEntry } from "../core/registry.ts";
import {
  CONTEXT_TARGETS,
  type ContextTarget,
  type RegistryScope,
} from "../core/targets.ts";
import { Status } from "./Status.tsx";
import { theme } from "./theme.ts";

export type ContextEntriesPhase =
  "target" | "loading" | "list" | "confirm" | "result";

type Phase = ContextEntriesPhase;

export type ContextEntriesUiAction =
  | { type: "escape" }
  | { type: "cancel" }
  | { type: "select-entry"; entry: ContextEntry }
  | { type: "confirm" }
  | { type: "return-home" };

export type ContextEntriesTransition =
  | { type: "return-home" }
  | { type: "cancel-confirmation" }
  | { type: "enter-confirmation"; entry: ContextEntry }
  | { type: "confirm-removal" }
  | { type: "none" };

export type ContextEntriesKey = {
  escape: boolean;
  return: boolean;
};

export type ContextEntriesListView = {
  entries: ContextEntry[];
  warnings: ContextEntryWarning[];
  isEmpty: boolean;
};

export function contextEntriesKeyAction(
  phase: ContextEntriesPhase,
  busy: boolean,
  input: string,
  key: ContextEntriesKey,
): ContextEntriesUiAction | null {
  if (busy) {
    return null;
  }
  if (key.escape) {
    return { type: "escape" };
  }
  if (phase === "confirm") {
    if (key.return) {
      return { type: "confirm" };
    }
    if (input.toLowerCase() === "n") {
      return { type: "cancel" };
    }
  }
  if (phase === "result" && key.return) {
    return { type: "return-home" };
  }
  return null;
}

export function contextEntriesTransition(
  phase: ContextEntriesPhase,
  busy: boolean,
  action: ContextEntriesUiAction,
): ContextEntriesTransition {
  if (busy) {
    return { type: "none" };
  }

  switch (action.type) {
    case "escape":
      return phase === "confirm"
        ? { type: "cancel-confirmation" }
        : { type: "return-home" };
    case "cancel":
      return phase === "confirm"
        ? { type: "cancel-confirmation" }
        : { type: "none" };
    case "select-entry":
      return phase === "list"
        ? { type: "enter-confirmation", entry: action.entry }
        : { type: "none" };
    case "confirm":
      return phase === "confirm"
        ? { type: "confirm-removal" }
        : { type: "none" };
    case "return-home":
      return phase === "result" ? { type: "return-home" } : { type: "none" };
  }
}

export function contextEntriesListView(
  entries: ContextEntry[],
  warnings: ContextEntryWarning[],
): ContextEntriesListView {
  return { entries, warnings, isEmpty: entries.length === 0 };
}

type ContextEntriesScreenProps = {
  isAdmin: boolean | null;
  onBack: () => void;
};

type Outcome = {
  ok: boolean;
  message: string;
  backupDir?: string;
  detail?: string;
};

export type RemovalElevationDecision = {
  allowed: boolean;
  message: string | null;
};

/** Human-readable scope label used in listings and confirmations. */
export function formatScopeLabel(scope: RegistryScope): string {
  return scope === "user" ? "User" : "Machine";
}

/** Show a command when present, otherwise identify the registry handler. */
export function formatCommandOrHandler(
  entry: Pick<ContextEntry, "command" | "handlerKind">,
): string {
  const command = entry.command?.trim();
  return command
    ? `Command: ${entry.command}`
    : `Handler: ${entry.handlerKind}`;
}

export function contextEntrySelectItems(
  entries: ContextEntry[],
): Array<{ key: string; label: string; value: ContextEntry }> {
  return entries.map((entry) => ({
    key: entry.registryPath,
    label: formatEntryListLabel(entry),
    value: entry,
  }));
}

/** Fail closed for machine-scoped removal until elevation is confirmed. */
export function evaluateRemovalElevation(
  scope: RegistryScope,
  isAdmin: boolean | null,
): RemovalElevationDecision {
  if (scope === "user" || isAdmin === true) {
    return { allowed: true, message: null };
  }

  const status =
    isAdmin === false
      ? "This process is not elevated."
      : "Elevation status is not known yet.";
  return {
    allowed: false,
    message: `${status} Machine-scoped removal requires elevation. Restart as Administrator (UAC) and try again.`,
  };
}

export function ContextEntriesScreen({
  isAdmin,
  onBack,
}: ContextEntriesScreenProps) {
  const [phase, setPhase] = useState<Phase>("target");
  const [target, setTarget] = useState<ContextTarget | null>(null);
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [warnings, setWarnings] = useState<ContextEntryWarning[]>([]);
  const [selected, setSelected] = useState<ContextEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (phase !== "loading" || target === null) {
      return;
    }

    let cancelled = false;
    void listContextEntries(target)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setEntries(result.entries);
        setWarnings(result.warnings);
        setPhase("list");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setOutcome({
          ok: false,
          message: "Failed to list context-menu entries",
          detail: error instanceof Error ? error.message : String(error),
        });
        setPhase("result");
      });

    return () => {
      cancelled = true;
    };
  }, [phase, target]);

  async function runRemoval() {
    if (!selected || target === null || busy) {
      return;
    }

    const elevation = evaluateRemovalElevation(selected.scope, isAdmin);
    if (!elevation.allowed) {
      setOutcome({
        ok: false,
        message: "Machine-scoped removal blocked",
        detail: `${elevation.message ?? "Elevation is required."} No registry changes were made.`,
      });
      setPhase("result");
      return;
    }

    setBusy(true);
    try {
      const { backupDir, result } = await removeContextEntry({
        target,
        scope: selected.scope,
        name: selected.name,
      });
      setOutcome({
        ok: result.ok,
        message: result.ok
          ? `Removed "${selected.label}" (${formatScopeLabel(selected.scope)})`
          : `Failed to remove "${selected.label}"`,
        backupDir,
        detail: result.ok
          ? undefined
          : [`exit code ${result.code}`, result.stderr, result.stdout]
              .filter((value) => value.trim().length > 0)
              .join("\n"),
      });
      setPhase("result");
    } catch (error) {
      setOutcome({
        ok: false,
        message: `Failed to back up or remove "${selected.label}"`,
        detail: error instanceof Error ? error.message : String(error),
      });
      setPhase("result");
    } finally {
      setBusy(false);
    }
  }

  function applyTransition(transition: ContextEntriesTransition) {
    switch (transition.type) {
      case "return-home":
        onBack();
        return;
      case "cancel-confirmation":
        setSelected(null);
        setPhase("list");
        return;
      case "enter-confirmation":
        setSelected(transition.entry);
        setPhase("confirm");
        return;
      case "confirm-removal":
        void runRemoval();
        return;
      case "none":
        return;
    }
  }

  useInput(
    (input, key) => {
      const action = contextEntriesKeyAction(phase, busy, input, key);
      if (!action) {
        return;
      }
      applyTransition(contextEntriesTransition(phase, busy, action));
    },
    { isActive: true },
  );

  if (phase === "result" && outcome) {
    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Status {...outcome} escapeHint="Esc to return to menu" />
      </Box>
    );
  }

  if (phase === "confirm" && selected && target !== null) {
    const elevation = evaluateRemovalElevation(selected.scope, isAdmin);
    const scopeHive = selected.scope === "user" ? "HKCU" : "HKLM";

    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Text color={theme.text} bold>
          Remove this context-menu entry?
        </Text>
        <Text color={theme.muted}>Label: {selected.label}</Text>
        <Text color={theme.muted}>Name: {selected.name}</Text>
        <Text color={theme.muted}>
          Scope: {formatScopeLabel(selected.scope)} ({scopeHive})
        </Text>
        <Text color={theme.muted}>Registry path: {selected.registryPath}</Text>
        <Text color={theme.muted}>Handler kind: {selected.handlerKind}</Text>
        <Text color={theme.muted}>{formatCommandOrHandler(selected)}</Text>
        {!elevation.allowed ? (
          <Text color={theme.warn}>{elevation.message}</Text>
        ) : null}
        <Text color={theme.muted}>
          {busy
            ? "Backing up and removing registry entry..."
            : "Enter confirm - n cancel - Esc cancel"}
        </Text>
      </Box>
    );
  }

  if (phase === "list") {
    const listView = contextEntriesListView(entries, warnings);
    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Text color={theme.text}>
          {listView.entries.length === 0
            ? "No context-menu entries found for this target."
            : `Found ${listView.entries.length} context-menu entr${listView.entries.length === 1 ? "y" : "ies"}.`}
        </Text>
        {listView.warnings.map((warning) => (
          <Text key={warning.scope} color={theme.warn}>
            Warning: {formatScopeLabel(warning.scope)} scope unavailable:{" "}
            {warning.message}
          </Text>
        ))}
        {listView.entries.length > 0 ? (
          <Box marginTop={1}>
            <SelectInput
              items={contextEntrySelectItems(listView.entries)}
              onSelect={(item) => {
                applyTransition(
                  contextEntriesTransition(phase, busy, {
                    type: "select-entry",
                    entry: item.value,
                  }),
                );
              }}
            />
          </Box>
        ) : null}
        <Text color={theme.muted}>
          {listView.entries.length > 0
            ? "Up/Down navigate - Enter select - Esc back"
            : "Esc back"}
        </Text>
      </Box>
    );
  }

  if (phase === "loading") {
    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Text color={theme.accent}>Loading context-menu entries...</Text>
        <Text color={theme.muted}>Reading HKLM and HKCU scopes...</Text>
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header target={null} />
      <Text color={theme.text}>
        Where should existing context-menu entries be managed?
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={CONTEXT_TARGETS.map((item) => ({
            label: `${item.label} - ${item.hint}`,
            value: item.id,
          }))}
          onSelect={(item) => {
            setTarget(item.value);
            setEntries([]);
            setWarnings([]);
            setSelected(null);
            setOutcome(null);
            setPhase("loading");
          }}
        />
      </Box>
      <Text color={theme.muted}>
        Up/Down navigate - Enter select - Esc back
      </Text>
    </Box>
  );
}

function formatEntryListLabel(entry: ContextEntry): string {
  const identity =
    entry.label === entry.name ? entry.name : `${entry.label} (${entry.name})`;
  const handler =
    entry.handlerKind === "command"
      ? entry.command
        ? "command"
        : "command (details unavailable)"
      : `${entry.handlerKind} handler`;
  return `[${formatScopeLabel(entry.scope)}] ${identity} - ${handler}`;
}

function Header({ target }: { target: ContextTarget | null }) {
  const info = target
    ? CONTEXT_TARGETS.find((candidate) => candidate.id === target)
    : null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent} bold>
        Manage context-menu entries
      </Text>
      <Text color={theme.muted}>
        {info
          ? `Target: ${info.label} - ${info.hint}`
          : "List and remove existing static shell verbs"}
      </Text>
    </Box>
  );
}
