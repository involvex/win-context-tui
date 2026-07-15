import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import {
  APP_PRESETS,
  resolvePresetExe,
  type AppPreset,
} from "../core/presets.ts";
import { quoteCommand } from "../core/paths.ts";
import { addContextCommand } from "../core/registry.ts";
import {
  CONTEXT_TARGETS,
  shellKeyForTarget,
  type ContextTarget,
} from "../core/targets.ts";
import { Status } from "./Status.tsx";
import { theme } from "./theme.ts";

type Phase = "target" | "preset" | "customFields" | "confirm" | "done";

type CustomField = "name" | "label" | "command";

type ContextCmdScreenProps = {
  onBack: () => void;
};

type ResolvedPreset = {
  preset: AppPreset;
  exe: string | null;
};

export function ContextCmdScreen({ onBack }: ContextCmdScreenProps) {
  const [phase, setPhase] = useState<Phase>("target");
  const [target, setTarget] = useState<ContextTarget>("background");
  const [resolved, setResolved] = useState<ResolvedPreset[]>([]);
  const [selected, setSelected] = useState<{
    name: string;
    label: string;
    command: string;
    args: string;
  } | null>(null);
  const [customField, setCustomField] = useState<CustomField>("name");
  const [name, setName] = useState("OpenApp");
  const [label, setLabel] = useState("Open with App");
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    ok: boolean;
    message: string;
    backupDir?: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const rows: ResolvedPreset[] = [];
      for (const preset of APP_PRESETS) {
        rows.push({
          preset,
          exe: await resolvePresetExe(preset),
        });
      }
      setResolved(rows);
    })();
  }, []);

  async function run() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { backupDir, result } = await addContextCommand({
        target,
        name: selected.name,
        label: selected.label,
        command: selected.command,
        args: selected.args,
      });
      setOutcome({
        ok: result.ok,
        message: result.ok
          ? `Added "${selected.label}" (${target})`
          : "Failed to add context command",
        backupDir,
        detail: result.ok
          ? undefined
          : result.stderr || result.stdout || `exit ${result.code}`,
      });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("preset");
    } finally {
      setBusy(false);
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (phase === "confirm" && !busy) {
        if (key.return) {
          void run();
        } else if (input.toLowerCase() === "n") {
          setPhase("preset");
        }
      }
      if (phase === "done" && key.return) {
        onBack();
      }
    },
    { isActive: true },
  );

  if (phase === "done" && outcome) {
    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Status {...outcome} />
      </Box>
    );
  }

  if (phase === "confirm" && selected) {
    const keyPath = shellKeyForTarget(target, selected.name);
    const cmdPreview = quoteCommand(selected.command, selected.args);
    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Text color={theme.text}>
          Key: <Text color={theme.accent}>{keyPath}</Text>
        </Text>
        <Text color={theme.muted}>Label: {selected.label}</Text>
        <Text color={theme.muted}>Command: {cmdPreview}</Text>
        <Text color={theme.muted}>
          {busy
            ? "Backing up and writing registry..."
            : "Enter confirm · n cancel · Esc back"}
        </Text>
      </Box>
    );
  }

  if (phase === "customFields") {
    return (
      <Box flexDirection="column">
        <Header target={target} />
        {customField === "name" ? (
          <FieldInput
            prompt="Registry key name (e.g. OpenCursor)"
            value={name}
            onChange={setName}
            onSubmit={() => {
              if (!name.trim()) {
                setError("Name is required");
                return;
              }
              setError(null);
              setCustomField("label");
            }}
          />
        ) : null}
        {customField === "label" ? (
          <FieldInput
            prompt="Menu label (e.g. Open with Cursor)"
            value={label}
            onChange={setLabel}
            onSubmit={() => {
              if (!label.trim()) {
                setError("Label is required");
                return;
              }
              setError(null);
              setCustomField("command");
            }}
          />
        ) : null}
        {customField === "command" ? (
          <FieldInput
            prompt="Executable path"
            value={command}
            onChange={setCommand}
            onSubmit={() => {
              if (!command.trim()) {
                setError("Executable path is required");
                return;
              }
              setError(null);
              const t = CONTEXT_TARGETS.find((x) => x.id === target);
              setSelected({
                name,
                label,
                command,
                args: t?.defaultArg ?? '"%1"',
              });
              setPhase("confirm");
            }}
          />
        ) : null}
        {error ? <Text color={theme.error}>{error}</Text> : null}
        <Text color={theme.muted}>Enter next · Esc back</Text>
      </Box>
    );
  }

  if (phase === "preset") {
    const items = [
      ...resolved.map((row) => ({
        label: row.exe
          ? `${row.preset.title}  (${row.exe})`
          : `${row.preset.title}  [not found — pick to edit path]`,
        value: row.preset.id,
      })),
      { label: "Custom executable...", value: "__custom__" },
    ];

    return (
      <Box flexDirection="column">
        <Header target={target} />
        <Text color={theme.text}>Choose app preset</Text>
        <Box marginTop={1}>
          <SelectInput
            items={items}
            onSelect={(item) => {
              if (item.value === "__custom__") {
                setCustomField("name");
                setPhase("customFields");
                return;
              }
              const row = resolved.find((r) => r.preset.id === item.value);
              if (!row) {
                return;
              }
              if (!row.exe) {
                setName(row.preset.name);
                setLabel(row.preset.menuLabel);
                setCommand(row.preset.candidates[0] ?? "");
                setCustomField("command");
                setPhase("customFields");
                return;
              }
              setSelected({
                name: row.preset.name,
                label: row.preset.menuLabel,
                command: row.exe,
                args: row.preset.args[target],
              });
              setPhase("confirm");
            }}
          />
        </Box>
        {error ? <Text color={theme.error}>{error}</Text> : null}
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header target={target} />
      <Text color={theme.text}>Where should the command appear?</Text>
      <Box marginTop={1}>
        <SelectInput
          items={CONTEXT_TARGETS.map((t) => ({
            label: `${t.label} — ${t.hint}`,
            value: t.id,
          }))}
          onSelect={(item) => {
            setTarget(item.value);
            setPhase("preset");
          }}
        />
      </Box>
      <Text color={theme.muted}>
        File vs empty space use different HKCR keys (%1 vs %V).
      </Text>
      <Text color={theme.muted}>Esc back</Text>
    </Box>
  );
}

function Header({ target }: { target: ContextTarget }) {
  const info = CONTEXT_TARGETS.find((t) => t.id === target);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent} bold>
        Context command
      </Text>
      <Text color={theme.muted}>Target: {info?.label ?? target}</Text>
    </Box>
  );
}

function FieldInput({
  prompt,
  value,
  onChange,
  onSubmit,
}: {
  prompt: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Box flexDirection="column">
      <Text color={theme.text}>{prompt}</Text>
      <Box>
        <Text color={theme.accent}>{"> "}</Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
    </Box>
  );
}
