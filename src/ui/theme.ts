/** Dark-mode terminal color tokens for Ink. */
export const theme = {
  muted: "gray",
  text: "white",
  accent: "cyan",
  success: "green",
  error: "red",
  warn: "yellow",
  border: "gray",
} as const;

export type ThemeColor = (typeof theme)[keyof typeof theme];
