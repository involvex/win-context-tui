#!/usr/bin/env bun
import { render } from "ink";
import { App } from "./app.tsx";

if (process.platform !== "win32") {
  console.error("win-context-tui only runs on Windows.");
  process.exit(1);
}

const { waitUntilExit } = render(<App />);

try {
  await waitUntilExit();
} finally {
  // Ink/Bun on Windows can leave stdin/raw-mode handles open after unmount
  process.exit(0);
}
