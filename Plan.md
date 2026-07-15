# win-context-tui

**Kurzfassung:** Hier ist der technische Projektplan für eine Bun + Ink basierte TUI zur Windows-Kontextmenü-Verwaltung. Der Plan umfasst die Architektur, Abhängigkeiten und den geforderten Agent-Prompt für Cursor, um das Projekt im standardmäßigen Dark-Mode direkt zu initiieren.

### App-Name

**`win-context-tui`**

### Technischer Projektplan

- **Laufzeit & Sprache:** Bun, TypeScript.
- **UI-Framework:** React, Ink (für CLI-Rendering).
- **Abhängigkeiten:** `bun add ink react chalk` sowie `bun add -D @types/react`.
- **Architektur & Struktur:**
- `src/index.tsx`: Entrypoint, Bootstrapping der Ink-App.
- `src/app.tsx`: Hauptkomponente, State-Management für die Navigation.
- `src/ui/`: Ordner für Dark-Mode-kompatible Komponenten (Menüs, Listen, Inputs).
- `src/core/registry.ts`: Auslagerung der Windows-Registry-Logik. Nutzung von `Bun.spawn(["reg", "add", ...])` zur Manipulation von `HKEY_CLASSES_ROOT`.

- **Kernfunktionen:**

1. **ShellNew-Manager:** Fügt Endungen wie `.json`, `.toml` zum "Neu"-Menü hinzu (Erstellt Schlüssel `ShellNew` und Wert `NullFile`).
2. **Command-Manager:** Fügt eigene Programme (z.B. Cursor, Terminal) zum Ordner-Hintergrund-Menü hinzu (`Directory\Background\shell`).

- **Design-Standard:** Strikte Terminal-Ästhetik / Dark Mode. Subtile Farben, primär Grau/Weiß für Text, dezente Akzente (z.B. Grün für Erfolgsmeldungen) via `chalk`.
- **Build-Prozess:** Standalone-Executable via `bun build --compile --minify ./src/index.tsx --outfile win-context.exe`.

---
