import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { theme } from "./theme.ts";

export type MenuAction =
  "shellNew" | "contextCmd" | "manageEntries" | "restartAdmin" | "quit";

type MenuProps = {
  isAdmin: boolean | null;
  onSelect: (action: MenuAction) => void;
};

export function Menu({ isAdmin, onSelect }: MenuProps) {
  const items: Array<{ label: string; value: MenuAction }> = [
    { label: "Add extension to New menu (ShellNew)", value: "shellNew" },
    {
      label: "Add app to context menu (file / folder / background)",
      value: "contextCmd",
    },
    {
      label: "Manage context-menu entries (list / remove)",
      value: "manageEntries",
    },
    ...(isAdmin === false
      ? [
          {
            label: "Restart as Administrator (UAC)",
            value: "restartAdmin" as const,
          },
        ]
      : []),
    { label: "Quit", value: "quit" },
  ];

  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        @involvex/win-context-tui
      </Text>
      <Text color={theme.muted}>
        Windows context menu enhancer · HKCR via reg.exe
      </Text>
      {isAdmin === false ? (
        <Text color={theme.warn}>
          Not elevated — HKCR writes may fail. Use Restart as Administrator.
        </Text>
      ) : isAdmin === true ? (
        <Text color={theme.success}>Running elevated</Text>
      ) : (
        <Text color={theme.muted}>Checking elevation...</Text>
      )}
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            onSelect(item.value);
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          Up/Down navigate · Enter select · Esc quit
        </Text>
      </Box>
    </Box>
  );
}
