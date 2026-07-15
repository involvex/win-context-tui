import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { addShellNew } from "../core/registry.ts";
import { normalizeExtension } from "../core/paths.ts";
import { Status } from "./Status.tsx";
import { theme } from "./theme.ts";

type Phase = "form" | "confirm" | "done";

type ShellNewScreenProps = {
  onBack: () => void;
};

export function ShellNewScreen({ onBack }: ShellNewScreenProps) {
  const [ext, setExt] = useState(".json");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    ok: boolean;
    message: string;
    backupDir?: string;
    detail?: string;
  } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const normalized = normalizeExtension(ext);
      const { backupDir, result } = await addShellNew(normalized);
      setOutcome({
        ok: result.ok,
        message: result.ok
          ? `Added ${normalized} to New menu (ShellNew + NullFile)`
          : `Failed to add ${normalized}`,
        backupDir,
        detail: result.ok
          ? undefined
          : result.stderr || result.stdout || `exit ${result.code}`,
      });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("form");
    } finally {
      setBusy(false);
    }
  }

  useInput(
    (_input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (phase === "confirm" && !busy) {
        if (key.return) {
          void run();
        } else if (inputIsNo(_input)) {
          setPhase("form");
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
        <Header />
        <Status {...outcome} />
      </Box>
    );
  }

  if (phase === "confirm") {
    let preview = ext;
    try {
      preview = normalizeExtension(ext);
    } catch {
      /* keep raw */
    }
    return (
      <Box flexDirection="column">
        <Header />
        <Text color={theme.text}>
          Add ShellNew + NullFile for{" "}
          <Text color={theme.accent}>{preview}</Text>?
        </Text>
        <Text color={theme.muted}>
          {busy
            ? "Backing up and writing registry…"
            : "Enter confirm · n cancel · Esc back"}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header />
      <Text color={theme.text}>File extension (e.g. .json, .toml)</Text>
      <Box>
        <Text color={theme.accent}>{"> "}</Text>
        <TextInput
          value={ext}
          onChange={setExt}
          onSubmit={() => {
            try {
              normalizeExtension(ext);
              setError(null);
              setPhase("confirm");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </Box>
      {error ? <Text color={theme.error}>{error}</Text> : null}
      <Text color={theme.muted}>Enter continue · Esc back</Text>
    </Box>
  );
}

function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent} bold>
        ShellNew — New menu
      </Text>
      <Text color={theme.muted}>Target: HKCR\.ext\ShellNew (NullFile)</Text>
    </Box>
  );
}

function inputIsNo(input: string): boolean {
  return input.toLowerCase() === "n";
}
