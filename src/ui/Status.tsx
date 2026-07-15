import { Box, Text } from "ink";
import { theme } from "./theme.ts";

type StatusProps = {
  ok: boolean;
  message: string;
  backupDir?: string;
  detail?: string;
};

export function Status({ ok, message, backupDir, detail }: StatusProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={ok ? theme.success : theme.error}>
        {ok ? "[OK]" : "[X]"} {message}
      </Text>
      {detail ? <Text color={theme.muted}>{detail}</Text> : null}
      {backupDir ? <Text color={theme.muted}>Backup: {backupDir}</Text> : null}
      <Text color={theme.muted}>
        Press Enter to return to menu · Esc to quit
      </Text>
    </Box>
  );
}
