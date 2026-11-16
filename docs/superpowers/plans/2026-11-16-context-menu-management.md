# Context Menu Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe listing and removal of static context-menu verbs for the file, directory, and directory-background targets already supported by the TUI.

**Architecture:** Keep registry writes in `src/core/registry.ts`, put structured read-only enumeration in a focused `src/core/contextEntries.ts` module, and make scope-aware paths explicit in `src/core/targets.ts`. The TUI consumes a core API and never constructs arbitrary registry paths itself. Every removal exports the exact backing-hive key before deleting it.

**Tech Stack:** Bun 1.4+, TypeScript strict mode, React 19, Ink 7, `reg.exe`, Windows PowerShell Registry provider for read-only JSON enumeration, `bun:test`.

**Spec:** This plan captures the approved in-conversation design from 2026-11-16.

## Global Constraints

- Manage only static direct children of `*\shell`, `Directory\shell`, and `Directory\Background\shell`; do not claim to enumerate every Windows context-menu handler.
- Use `HKLM\Software\Classes` and `HKCU\Software\Classes` as explicit backing scopes; never delete a selected entry through merged `HKCR`.
- Listing is read-only. Mutation uses `reg.exe` through `src/core/spawn.ts` and checks `result.ok` plus stderr/stdout.
- Every mutation must create a successful `reg export` backup first. Removal must abort if the selected key is absent or export fails.
- The removal API accepts only target, scope, and entry name; it constructs the registry path internally and rejects path-like names.
- Preserve existing add behavior and public APIs unless a backward-compatible extension is required.
- Use `.ts` import suffixes, strict TypeScript, `noUncheckedIndexedAccess`, and the existing dark/hacker theme.
- Do not perform live registry deletion during automated tests. Live checks are read-only unless the user separately approves a disposable write/delete test.

## Review Focus

- A user-scoped entry must never be deleted from the machine backing store.
- A failed or missing backup must prevent deletion.
- Entry names must not escape the selected shell root.
- Non-ASCII labels must survive JSON enumeration.
- Same-name user and machine entries must merge with user precedence and deterministic ordering.

---

### Task 1: Scope-aware target paths and context-entry listing

**Files:**

- Create: `src/core/contextEntries.ts`
- Modify: `src/core/targets.ts`
- Modify: `package.json`
- Create: `tests/targets.test.ts`
- Create: `tests/contextEntries.test.ts`

**Interfaces:**

- Produces: `RegistryScope = "machine" | "user"`.
- Produces: `shellRootForTarget(target, scope)` and `backingShellKeyForTarget(target, scope, name)` with exact HKLM/HKCU paths.
- Produces: `ContextEntry`, `ContextEntryWarning`, `ListContextEntriesResult`.
- Produces: `listContextEntries(target)` and a runner-injectable test seam.

- [ ] Write failing target-path tests for all three targets and both scopes.
- [ ] Run `bun test tests/targets.test.ts` and confirm failure because the new exports do not exist.
- [ ] Implement the minimal scope and path helpers.
- [ ] Run the target tests and confirm they pass.
- [ ] Write failing tests for JSON parsing, Unicode labels, empty output, metadata variants, user-over-machine merging, and deterministic sorting.
- [ ] Run `bun test tests/contextEntries.test.ts` and confirm the expected missing-module/API failures.
- [ ] Implement UTF-8 PowerShell enumeration and the pure parser/merge functions.
- [ ] Run both test files and `bun run typecheck`.
- [ ] Add `"test": "bun test"` to `package.json` and run `bun test`.
- [ ] Commit with `feat: list context menu entries`.

### Task 2: Backup-safe context-entry removal

**Files:**

- Modify: `src/core/targets.ts`
- Modify: `src/core/backup.ts`
- Modify: `src/core/registry.ts`
- Create: `tests/registry.test.ts`

**Interfaces:**

- Consumes: `RegistryScope`, `backingShellKeyForTarget` from Task 1.
- Produces: `RemoveContextEntryOptions` and `removeContextEntry(options)`.
- Extends: `createBackup`/`withBackup` with a require-existing safety option and dependency injection suitable for non-destructive tests.

- [ ] Write failing tests proving invalid/path-like names are rejected and no arbitrary path is accepted.
- [ ] Run `bun test tests/registry.test.ts` and confirm the expected missing-export failures.
- [ ] Implement strict entry-name validation and the scope-aware removal path builder.
- [ ] Write failing tests proving deletion does not run when the key is missing or `reg export` fails.
- [ ] Run the tests and confirm the safety assertions fail for the expected reason.
- [ ] Implement require-existing backup behavior and `removeContextEntry` using `withBackup` plus `reg delete <exact-path> /f`.
- [ ] Run `bun test`, `bun run typecheck`, and `bun run lint`.
- [ ] Commit with `feat: remove context menu entries safely`.

### Task 3: Ink list-and-remove workflow

**Files:**

- Create: `src/ui/ContextEntriesScreen.tsx`
- Modify: `src/ui/Menu.tsx`
- Modify: `src/app.tsx`

**Interfaces:**

- Consumes: `listContextEntries`, `removeContextEntry`, `ContextEntry`, and the existing `Status` component.
- Produces: home-menu action `manageEntries` and a keyboard-driven target/list/confirm/result flow.

- [ ] Implement the target-selection phase using `CONTEXT_TARGETS` and `SelectInput`.
- [ ] Implement loading and list phases, including empty lists and scope warnings.
- [ ] Implement a confirmation phase showing label, entry name, scope, exact registry path, and command/handler kind.
- [ ] Implement removal and result states using the existing status styling and backup path output.
- [ ] Block machine-scoped removal when `isAdmin === false` and explain how to restart elevated.
- [ ] Wire `manageEntries` into `Menu.tsx` and `app.tsx` without breaking global Escape behavior.
- [ ] Run `bun run check` and `bun run build:exe`.
- [ ] Manually inspect the TUI in a real terminal using read-only listing; do not delete a live registry entry.
- [ ] Commit with `feat: add context menu management screen`.

### Task 4: Documentation and final verification

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: the completed public APIs and TUI flow.
- Produces: user-facing feature, scope, elevation, backup/restore, and Windows 11 limitation documentation.

- [ ] Document listing/removal, user versus machine scope, and the three-target limitation.
- [ ] Document administrator requirements, exact backup location, and restore using `reg import`.
- [ ] Update the project structure and test command in `AGENTS.md`.
- [ ] Run `bun run format`, `bun test`, `bun run check`, and `bun run build:exe`.
- [ ] Review `git diff --check` and `git status --short`.
- [ ] Commit with `docs: document context menu management`.
