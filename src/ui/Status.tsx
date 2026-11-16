import { Box, Text } from "ink";
import { theme } from "./theme.ts";

export const DEFAULT_STATUS_ESCAPE_HINT = "Esc to quit";

export function resolveStatusEscapeHint(escapeHint?: string): string {
  return escapeHint ?? DEFAULT_STATUS_ESCAPE_HINT;
}

type StatusProps = {
  ok: boolean;
  message: string;
  backupDir?: string;
  detail?: string;
  escapeHint?: string;
};

export function Status({
  ok,
  message,
  backupDir,
  detail,
  escapeHint,
}: StatusProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={ok ? theme.success : theme.error}>
        {ok ? "[OK]" : "[X]"} {message}
      </Text>
      {detail ? <Text color={theme.muted}>{detail}</Text> : null}
      {backupDir ? <Text color={theme.muted}>Backup: {backupDir}</Text> : null}
      <Text color={theme.muted}>
        Press Enter to return to menu · {resolveStatusEscapeHint(escapeHint)}
      </Text>
    </Box>
  );
}
