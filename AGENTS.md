# AGENTS.md

Windows context-menu enhancer TUI. Bun + TypeScript + React + Ink.
Add flows write through `HKEY_CLASSES_ROOT` (HKCR) via `reg.exe` (no native
bindings). Listing and removal use explicit HKLM/HKCU backing paths. Add flows
back up their primary target key; context-entry removal exports the exact child
before deletion.

## Useful Commands

All commands run in PowerShell (default shell) unless noted. Use `bun`, not
npm/yarn/pnpm.

| Script          | Purpose                              | Example         |
| --------------- | ------------------------------------ | --------------- |
| `bun install`   | Install dependencies                 | `bun install`   |
| `bun run dev`   | Watch mode (restarts on file change) | `bun run dev`   |
| `bun run start` | Run once (no build required)         | `bun run start` |
| `bun test`      | Run automated tests                  | `bun test`      |

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

Verify before committing:

```powershell
bun test
bun run check
```

## Technologies

- **Runtime:** Bun `>= 1.3.5` (`package.json` engines field)
- **Language:** TypeScript `6.0.3`, strict mode, `verbatimModuleSyntax`
- **UI framework:** React `^19.2.7` rendered with Ink `^7.1.1` (terminal/CLI UI)

- **Ink plugins:** `ink-select-input` `^6.2.0`, `ink-text-input` `^6.0.0`
- **Tooling:** ESLint `^9.39.2` (flat config, `eslint.config.js`), Prettier `^3.10.1`
- **Type check:** `tsc --noEmit` (bundler module resolution, `jsx: react-jsx`)
- **Testing:** Bun's built-in test runner; registry commands use injected fakes
- **Platform:** Windows only; `reg.exe` for writes and the Windows PowerShell
  Registry provider for read-only enumeration (no native bindings). Machine-scoped
  removals and most HKCR writes require administrator privileges.
- **Build:** `bun build --compile --minify ./src/index.tsx --outfile dist/win-context.exe`

Project structure:

```text
src/
  index.tsx    # Entrypoint, boots the Ink app
  app.tsx      # Main component, navigation state
  ui/
    ContextEntriesScreen.tsx  # List/remove static shell verbs
    Menu.tsx                  # Home-menu actions
    Status.tsx                # Shared result display
    ShellNewScreen.tsx        # Add a ShellNew extension
    ContextCmdScreen.tsx      # Add a context command
    sanitize.ts               # Terminal-control sanitizer for rendered registry text
    theme.ts                  # Dark/hacker color theme
  core/
    contextEntries.ts  # Scope-aware enumeration, parsing, and merge
    registry.ts        # Registry mutations and removeContextEntry
    backup.ts          # Pre-mutation reg export and metadata
    elevation.ts       # Admin detection and UAC relaunch
    spawn.ts           # reg.exe process wrapper
    targets.ts         # Target and backing-scope registry paths
    paths.ts           # Path and registry-key helpers
    presets.ts         # Common application presets
tests/
  contextEntries.test.ts       # Enumeration, parsing, merge, and scope regressions
  contextEntriesScreen.test.ts  # Management-screen formatting and behavior
  registry.test.ts              # Backup and exact-child removal regressions
  sanitize.test.ts              # Terminal-control sanitization regressions
  targets.test.ts               # Target and backing-scope path regressions
```

## Best Practices

- **Type-first:** Run `bun run typecheck` after touching `src/`. `strict: true` and
  `noUncheckedIndexedAccess: true` are enabled; handle `undefined` indexing explicitly.
- **Backup before mutation:** Use `core/backup.ts` `withBackup(key, mutate)`.
  Context-entry removal exports the exact child before deletion and uses
  `requireExisting`; it aborts if the key is missing or `reg export` fails.
  Add flows back up their primary target key only; separately touched companion
  keys are not separately exported.
- **Backup layouts:** An existing primary key produces `registry-entry.reg`
  plus `meta.json`. A missing primary key produces `STUB.txt` plus `meta.json`
  with no `.reg`. `meta.json.createdAt` is the backup creation timestamp.
  Restore an existing-key backup with `reg import`; roll back a missing-key
  backup by deleting the key recorded in `STUB.txt` and `meta.json`.
- **Backup results:** Return the backup directory after a successful backup,
  including when the later mutation returns failure or rejects with
  `BackupMutationError`. A backup/query/export failure before a successful
  backup has no directory.

- **Render-boundary sanitization:** Pass registry-derived labels, names, paths,
  commands, delegate values, and metadata through `ui/sanitize.ts` before
  rendering them in Ink. Keep the raw core values unchanged.

- **Explicit context scopes:** `core/contextEntries.ts` reads the machine
  (`HKLM\Software\Classes`) and user (`HKCU\Software\Classes`) roots, then
  merges same-name entries with user precedence. Keep the scope on every
  listed entry and surface per-scope query warnings. Read both the default
  command and `DelegateExecute` from the standard verb `command` subkey.

- **Exact-child removal:** Call `removeContextEntry` with target, scope, and
  entry name. It constructs the exact backing-hive child path through
  `core/targets.ts` and rejects path-like names. Never delete through merged
  `HKCR` or target a parent shell root.

- **Elevation:** Detect elevation with `net session` (`core/elevation.ts`
  `isAdmin()`); relaunch via `Start-Process -Verb RunAs`
  (`restartAsAdmin()`). User-scoped removal does not require elevation;
  machine-scoped removal requires a confirmed elevated session. Prefer the
  "Restart as Administrator" menu option when needed.
- **Registry targets:** Use `core/targets.ts` constants rather than hardcoding
  hives. Add flows use the HKCR roots:
  - File selected → `HKCR\*\shell` (`"%1"`)
  - Folder selected → `HKCR\Directory\shell` (`"%1"`)
  - Empty folder background → `HKCR\Directory\Background\shell` (`"%V"`)

  Listing and removal use the explicit HKLM/HKCU backing paths from
  `shellRootForTarget` and `backingShellKeyForTarget`; never delete through
  merged HKCR.

- **Imports:** Use `.ts` extensions in import paths (verbatim module syntax),
  e.g. `import { spawn } from "./spawn.ts";`.
- **Registry safety:** `reg.exe` calls are wrapped in `core/spawn.ts`; check
  `result.ok` and surface `stderr`/`stdout` on failure. Use `/f` to force
  overwrites intentionally.

- **Non-destructive tests:** Inject fake registry runners and temporary backup
  roots. Automated tests must never perform a live registry deletion.
- **Formatting:** Run `bun run format` before pushing; Prettier check is part of
  `bun run check`.
- **Admin shell for installs:** `bun link` and HKCR writes need an elevated
  PowerShell.

## Guidelines

- Prefer `bun` for Node.js tasks (installing, running scripts). Use `go` for Go
  modules and `task` for Taskfile.yml automation.
- Before claiming work complete: run `bun test`, `bun run lint`, and
  `bun run typecheck`; only report success after verification passes.
- Before committing/pushing: run local tests and checks, match CI commands,
  and do not bypass git hooks without explicit instruction.
- Dark Mode is the default appearance; Hacker Theme (black background, green
  font) is the preferred color scheme unless the user requests otherwise.
