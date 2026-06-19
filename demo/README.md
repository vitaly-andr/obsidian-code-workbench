# Demo — Code Workbench in action

Realistic fixtures to see the plugin's three features on every supported language.

## How to use

1. Open this `demo/` folder as an Obsidian vault (or copy it into a vault).
2. Install **Code Workbench** and turn on **Settings → Code Workbench → Enable syntax highlighting**.
3. Open the files in any language folder:

| File | Shows | What to do |
|------|-------|-----------|
| `sample-<lang>.<ext>` | **Highlighting** | just open it — every language has one |
| `messy-<lang>.<ext>`  | **Diagnostics** | open it; a red underline marks the deliberate syntax error (noted in a comment) |
| `format-me-<lang>.<ext>` | **Formatting** | run **Format code file** (Command Palette) and watch the layout fix itself |

## Coverage

52 languages. Highlighting on all of them; diagnostics where a tree-sitter grammar exists (48);
formatting where a formatter ships (28). See the table in the [main README](../README.md#language-support).

- No `messy-*` for `diff`, `less`, `scss`, `wat` — these use the simple highlighter only (no diagnostics).
- `format-me-*` exists only for the 28 languages the plugin can format today. The rest highlight and
  diagnose; formatting for more languages is planned via an external-formatter layer.
