// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Inline current-line git blame for CodeView: a dim annotation at the end of the cursor's line
// ("author · age · summary"). Inert until CodeView delivers data via `setBlame`; the actual
// `git blame` runs in CodeView, never here. CM6 core (state/view) stays external/host-provided.
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { Extension, StateEffect, StateField } from "@codemirror/state";
import type { BlameLine } from "../git/types";

// Replace the editor's blame data (null clears it). CodeView dispatches this after `git blame`.
export const setBlame = StateEffect.define<readonly BlameLine[] | null>();

// Holds the per-line blame for the open file, indexed by (line number - 1).
const blameData = StateField.define<readonly BlameLine[] | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setBlame)) return e.value;
    return value;
  },
});

// Compact, GitLens-style age: "just now" / "2m" / "3h" / "5d" / "2w" / "4mo" / "1y". `now` is
// passed in (epoch ms) so the formatting is pure and unit-testable.
export function relativeAge(epochSec: number, now: number): string {
  const s = Math.max(0, Math.floor(now / 1000) - epochSec);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

// The annotation text for one line, led by the commit's short hash (as `git blame` does).
// Uncommitted edits read as a plain marker (no commit yet, so no hash).
export function annotationText(entry: BlameLine, now: number): string {
  if (entry.uncommitted) return "You · uncommitted";
  const sum = entry.summary.length > 50 ? entry.summary.slice(0, 49) + "…" : entry.summary;
  return `${entry.hash.slice(0, 7)} · ${entry.author} · ${relativeAge(entry.epoch, now)} · ${sum}`;
}

class BlameWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }
  eq(other: BlameWidget): boolean {
    return other.text === this.text;
  }
  toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement("span");
    span.className = "cw-blame-inline";
    span.textContent = this.text;
    return span;
  }
  // Decorative only: never let the widget swallow editor events.
  ignoreEvent(): boolean {
    return true;
  }
}

// A single trailing widget on the cursor's line. Recomputed from scratch each transaction (cheap —
// one lineAt + array index), so widget positions never need change-mapping.
const blameDeco = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(_value, tr) {
    const blame = tr.state.field(blameData);
    if (!blame || blame.length === 0) return Decoration.none;
    const head = tr.state.selection.main.head;
    const line = tr.state.doc.lineAt(head);
    const entry = blame[line.number - 1];
    if (!entry) return Decoration.none;
    const widget = Decoration.widget({
      widget: new BlameWidget(annotationText(entry, Date.now())),
      side: 1,
    });
    return Decoration.set([widget.range(line.to)]);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Inline current-line blame. Inert until `setBlame` delivers data. `blameData` is listed first so
// `blameDeco.update` can read it from the same state.
export function blameAnnotation(): Extension {
  return [blameData, blameDeco];
}
