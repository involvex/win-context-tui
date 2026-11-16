# @involvex/win-context-tui

Windows context-menu enhancer TUI. Bun + TypeScript + React + Ink.

Adds classic static context-menu commands and can list or remove existing static
shell verbs. Uses `reg.exe` and the Windows PowerShell Registry provider (no
native bindings). Backs up the exact key before every write.

## Requirements

- Windows
- [Bun](https://bun.sh) `>= 1.3.5`
- Administrator privileges for machine-scoped removals and most add operations

Listing entries and removing user-scoped entries do not require elevation.

## Setup

```bash
bun install
```

## Commands

| Script                 | Purpose                         |
| ---------------------- | ------------------------------- |
| `bun run dev`          | Watch mode                      |
| `bun run start`        | Run once                        |
| `bun test`             | Run the automated test suite    |
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

1. **ShellNew** — add an extension to Explorer's **New** menu.
2. **Context command** — add Cursor / VS Code / Terminal / custom apps to:
   - **File selected** → `HKCR\*\shell` (`"%1"`)
   - **Folder selected** → `HKCR\Directory\shell` (`"%1"`)
   - **Folder background** → `HKCR\Directory\Background\shell` (`"%V"`)
3. **Manage context-menu entries** — list static direct children and remove one
   exact child after a successful backup.
4. **Restart as Administrator** — UAC relaunch via `Start-Process -Verb RunAs`.

### Manage existing entries

1. Select **Manage context-menu entries (list / remove)** from the home menu.
2. Choose the Explorer target: selected file, selected folder, or folder
   background.
3. Review the list. Each row shows its scope, label and registry name, and
   handler kind. Warnings identify a scope that could not be read.
4. Select an entry and review the label, name, scope, exact backing-hive path,
   and command or handler kind.
5. Press **Enter** to confirm, or **n** / **Esc** to cancel.
6. The result shows whether removal succeeded, the backup directory, and
   detailed process output when it failed.

Listing is read-only. A removal exports the selected child key before deleting
it, then deletes only that child in the selected scope. A missing key or failed
backup stops the removal.

### User and machine scope

The TUI reads both explicit backing stores:

- Machine: `HKLM\Software\Classes`
- User: `HKCU\Software\Classes`

The list is the effective view: when the same child name exists in both
scopes, the user entry takes precedence and the machine entry is not shown.
Removing the user entry does not change the machine entry.

User-scoped removal can run in a non-elevated session. Machine-scoped removal
requires an elevated session; use **Restart as Administrator** when needed.
The confirmation screen shows the exact `HKCU` or `HKLM` path before removal.

## Supported targets

| Right-click            | HKCR location                | Machine backing root                               | User backing root                                  | Typical arg        |
| ---------------------- | ---------------------------- | -------------------------------------------------- | -------------------------------------------------- | ------------------ |
| On a file              | `*\shell`                    | `HKLM\Software\Classes\*\shell`                    | `HKCU\Software\Classes\*\shell`                    | `"%1"` file path   |
| On a folder            | `Directory\shell`            | `HKLM\Software\Classes\Directory\shell`            | `HKCU\Software\Classes\Directory\shell`            | `"%1"` folder path |
| Empty area in a folder | `Directory\Background\shell` | `HKLM\Software\Classes\Directory\Background\shell` | `HKCU\Software\Classes\Directory\Background\shell` | `"%V"` current dir |

Presets (Cursor, VS Code, Windows Terminal, PowerShell, pwsh) pick the right
args per target.

## Limitations

The manager covers only static direct children of the three shell roots above.
It does not:

- enumerate extension-specific verbs;
- enumerate drive, network, or desktop classes;
- manage COM `ShellEx` handlers; or
- provide a complete inventory of Windows 11 modern packaged-context-menu
  entries.

A menu item visible in Windows 11 may therefore be missing from the list and
cannot be removed through this TUI.

## Backups and restore

Backups use UUID-named directories:

```text
%LOCALAPPDATA%\win-context-tui\backups\<uuid>\
  registry-entry.reg
  meta.json
```

A context-entry removal requires the selected key to exist and its export to
succeed, so `registry-entry.reg` and `meta.json` are written before deletion.
`meta.json` records the exact key, creation time, and exported file. Add flows
can also create `STUB.txt` when the key did not exist before the edit.

Restore a backup manually with `reg import`:

```bat
reg import "%LOCALAPPDATA%\win-context-tui\backups\<uuid>\registry-entry.reg"
```

Use an elevated shell to restore a machine-scoped key. The TUI does not
provide an automatic restore action.

## Testing

```bash
bun test
```

Automated tests inject fake registry runners and use temporary backup roots.
They never perform a live registry deletion.

## Notes

- Prefer **Restart as Administrator** from the menu when not elevated.
- Day-to-day: `bun run start` / `dev` — no `.js` build required.
