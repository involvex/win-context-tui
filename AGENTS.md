# AGENTS.md

Windows context-menu enhancer TUI. Bun + TypeScript + React + Ink.
Edits `HKEY_CLASSES_ROOT` via `reg.exe` (no native bindings). Backs up
touched keys before every write.

## Useful Commands

All commands run in PowerShell (default shell) unless noted. Use `bun`, not
npm/yarn/pnpm.

| Script          | Purpose                              | Example         |
| --------------- | ------------------------------------ | --------------- |
| `bun install`   | Install dependencies                 | `bun install`   |
| `bun run dev`   | Watch mode (restarts on file change) | `bun run dev`   |
| `bun run start` | Run once (no build required)         | `bun run start` |

| `bun run typecheck` | `tsc --noEmit` | `bun run typecheck` |
| `bun run lint` | ESLint | `bun run lint` |
| `bun run format` | Prettier write | `bun run format` |
| `bun run format:check` | Prettier check | `bun run format:check` |

| `bun run check` | typecheck + lint + format check | `bun run check` |
| `bun run build:exe` | Compile `dist/win-context.exe` | `bun run build:exe` |

Link the CLI globally (admin shell):

```powershell
bun link
win-context-tui
```

Verify typecheck before committing:

```powershell
bun run check
```

## Technologies

- **Runtime:** Bun `>= 1.3.5` (`package.json` engines field)
- **Language:** TypeScript `~5.8.3`, strict mode, `verbatimModuleSyntax`
- **UI framework:** React `^19.2.7` rendered with Ink `^7.1.0` (terminal/CLI UI)

- **Ink plugins:** `ink-select-input` `^6.2.0`, `ink-text-input` `^6.0.0`
- **Tooling:** ESLint `^9.39.2` (flat config, `eslint.config.js`), Prettier `^3.7.4`
- **Type check:** `tsc --noEmit` (bundler module resolution, `jsx: react-jsx`)
- **Platform:** Windows only; `reg.exe` for `HKEY_CLASSES_ROOT` writes (no native
  bindings). Administrator privileges required for most HKCR writes.
- **Build:** `bun build --compile --minify ./src/index.tsx --outfile dist/win-context.exe`

Project structure:

```
src/
  index.tsx    # Entrypoint, boots the Ink app
  app.tsx      # Main component, navigation state
  ui/          # Ink components (Menu, Status, ShellNewScreen, ContextCmdScreen, theme)
  core/        # registry.ts, backup.ts, elevation.ts, spawn.ts, targets.ts, paths.ts, presets.ts
```

## Best Practices

- **Type-first:** Run `bun run typecheck` after touching `src/`. `strict: true` and
  `noUncheckedIndexedAccess: true` are enabled; handle `undefined` indexing explicitly.
- **Backup before mutation:** Every registry write goes through
  `core/backup.ts` `withBackup(key, mutate)`. Keys are exported to
  `%LOCALAPPDATA%\win-context-tui\backups\<timestamp>\` before any change. Never
  write to `HKCR` without a backup.

- **Elevation:** Most HKCR writes require admin. Detect with `net session`
  (`core/elevation.ts` `isAdmin()`); relaunch via
  `Start-Process -Verb RunAs` (`restartAsAdmin()`). Prefer the "Restart as
  Administrator" menu option when not elevated.
- **Registry targets:** Use `core/targets.ts` constants rather than hardcoding
  hives:
  - File selected → `HKCR\*\shell` (`"%1"`)
  - Folder selected → `HKCR\Directory\shell` (`"%1"`)
  - Empty folder background → `HKCR\Directory\Background\shell` (`"%V"`)

- **Imports:** Use `.ts` extensions in import paths (verbatim module syntax),
  e.g. `import { spawn } from "./spawn.ts";`.
- **Registry safety:** `reg.exe` calls are wrapped in `core/spawn.ts`; check
  `result.ok` and surface `stderr`/`stdout` on failure. Use `/f` to force
  overwrites intentionally.

- **Formatting:** Run `bun run format` before pushing; Prettier check is part of
  `bun run check`.
- **Admin shell for installs:** `bun link` and HKCR writes need an elevated
  PowerShell.

## Guidelines

- Prefer `bun` for Node.js tasks (installing, running scripts). Use `go` for Go
  modules and `task` for Taskfile.yml automation.
- Before claiming work complete: run `bun run lint` and `bun run typecheck`;
  only report success after verification passes.
- Before committing/pushing: run local lint and typecheck, match CI commands,
  and do not bypass git hooks without explicit instruction.
- Dark Mode is the default appearance; Hacker Theme (black background, green
  font) is the preferred color scheme unless the user requests otherwise.
