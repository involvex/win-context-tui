# @involvex/win-context-tui

Windows context-menu enhancer TUI. Bun + TypeScript + React + Ink.

Edits `HKEY_CLASSES_ROOT` via `reg.exe` (no native bindings). Backs up
touched keys before every write.

## Requirements

- Windows
- [Bun](https://bun.sh) `>= 1.3.5`
- Administrator privileges for most HKCR writes

## Setup

```bash
bun install
```

## Commands

| Script                 | Purpose                         |
| ---------------------- | ------------------------------- |
| `bun run dev`          | Watch mode                      |
| `bun run start`        | Run once                        |
| `bun run check`        | typecheck + lint + format check |
| `bun run typecheck`    | `tsc --noEmit`                  |
| `bun run lint`         | ESLint                          |
| `bun run format`       | Prettier write                  |
| `bun run format:check` | Prettier check                  |
| `bun run build:exe`    | Optional `dist/win-context.exe` |

```bash
bun link
win-context-tui
```

## Features

1. **ShellNew** — add an extension to Explorer’s **New** menu.
2. **Context command** — add Cursor / VS Code / Terminal / custom apps to:
   - **File selected** → `HKCR\*\shell` (`"%1"`)
   - **Folder selected** → `HKCR\Directory\shell` (`"%1"`)
   - **Folder background** → `HKCR\Directory\Background\shell` (`"%V"`)
3. **Restart as Administrator** — UAC relaunch via `Start-Process -Verb RunAs`.

### File vs empty-space click

Yes — different registry keys:

| Right-click            | Registry hive                | Typical arg        |
| ---------------------- | ---------------------------- | ------------------ |
| On a file              | `*\shell`                    | `"%1"` file path   |
| On a folder            | `Directory\shell`            | `"%1"` folder path |
| Empty area in a folder | `Directory\Background\shell` | `"%V"` current dir |

Presets (Cursor, VS Code, Windows Terminal, PowerShell, pwsh) pick the right args per target.

## Backups

`%LOCALAPPDATA%\win-context-tui\backups\<timestamp>\`

Restore:

```bat
reg import "%LOCALAPPDATA%\win-context-tui\backups\<timestamp>\<file>.reg"
```

## Notes

- Prefer **Restart as Administrator** from the menu when not elevated.
- Day-to-day: `bun run start` / `dev` — no `.js` build required.
