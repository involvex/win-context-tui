import { Box, Text, useApp, useInput, useStdin } from "ink";
import { useEffect, useState } from "react";
import { isAdmin, restartAsAdmin } from "./core/elevation.ts";
import { ContextCmdScreen } from "./ui/ContextCmdScreen.tsx";
import { Menu, type MenuAction } from "./ui/Menu.tsx";
import { ShellNewScreen } from "./ui/ShellNewScreen.tsx";
import { theme } from "./ui/theme.ts";

type Screen = "home" | "shellNew" | "contextCmd";

function forceQuit() {
  // Ensure the process leaves raw mode and open handles on Windows/Bun
  setImmediate(() => {
    process.exit(0);
  });
}

export function App() {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const [screen, setScreen] = useState<Screen>("home");
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    void isAdmin().then(setAdmin);
  }, []);

  function quit() {
    exit();
    forceQuit();
  }

  useInput(
    (_input, key) => {
      if (key.escape && screen === "home") {
        quit();
      }
    },
    { isActive: Boolean(isRawModeSupported) },
  );

  async function onMenuSelect(action: MenuAction) {
    setStatusMsg(null);
    if (action === "quit") {
      quit();
      return;
    }
    if (action === "shellNew") {
      setScreen("shellNew");
      return;
    }
    if (action === "contextCmd") {
      setScreen("contextCmd");
      return;
    }
    if (action === "restartAdmin") {
      setStatusMsg("Requesting elevation (UAC)...");
      const result = await restartAsAdmin();
      if (result.ok) {
        setStatusMsg("Elevated process started — exiting...");
        quit();
        return;
      }
      setStatusMsg(result.error ?? "Elevation failed");
    }
  }

  if (!isRawModeSupported) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.error}>
          Interactive TUI requires a real terminal (raw mode / TTY).
        </Text>
        <Text color={theme.muted}>
          Run: bun run start (or bun run dev) in Windows Terminal / cmd.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={theme.border}>{"─".repeat(48)}</Text>
      </Box>
      {screen === "home" ? (
        <Box flexDirection="column">
          <Menu isAdmin={admin} onSelect={(a) => void onMenuSelect(a)} />
          {statusMsg ? <Text color={theme.warn}>{statusMsg}</Text> : null}
        </Box>
      ) : null}
      {screen === "shellNew" ? (
        <ShellNewScreen onBack={() => setScreen("home")} />
      ) : null}
      {screen === "contextCmd" ? (
        <ContextCmdScreen onBack={() => setScreen("home")} />
      ) : null}
    </Box>
  );
}
