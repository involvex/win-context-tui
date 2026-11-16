/* eslint-disable no-control-regex -- this module intentionally matches terminal control sequences. */

const OSC_SEQUENCE_PATTERN =
  /\u001B\][\s\S]*?(?:\u0007|\u001B\\|\u009C|$)|\u009D[\s\S]*?(?:\u0007|\u009C|$)/g;
const STRING_CONTROL_SEQUENCE_PATTERN =
  /\u001B[P^_X][\s\S]*?(?:\u001B\\|\u009C|$)|[\u0090\u0098\u009E\u009F][\s\S]*?(?:\u009C|$)/g;
const CSI_SEQUENCE_PATTERN =
  /\u001B\[[0-?]*[\u0020-\u002F]*[@-~]|\u009B[0-?]*[\u0020-\u002F]*[@-~]/g;
const ANSI_SEQUENCE_PATTERN = /\u001B[ -/]*[0-~]/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;

/** Remove terminal control sequences while preserving ordinary Unicode text. */
export function sanitizeTerminalText(value: string): string {
  return value
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(STRING_CONTROL_SEQUENCE_PATTERN, "")
    .replace(CSI_SEQUENCE_PATTERN, "")
    .replace(ANSI_SEQUENCE_PATTERN, "")
    .replace(CONTROL_CHARACTER_PATTERN, "");
}
