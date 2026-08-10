"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useGame } from "@/lib/game-store";
import { PixelButton, PixelPanel } from "@/components/ui/pixel";

const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0a120c",
      color: "#c9e8ce",
      fontSize: "13.5px",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      caretColor: "#3dff74",
    },
    ".cm-cursor": { borderLeftColor: "#3dff74", borderLeftWidth: "2px" },
    ".cm-gutters": {
      backgroundColor: "#0f1a11",
      color: "#7ea98a",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#0f1a1180" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#1c3322 !important",
    },
    ".cm-line.vc-conflict-ours": { backgroundColor: "rgba(61,255,116,0.10)" },
    ".cm-line.vc-conflict-sep": { backgroundColor: "rgba(255,176,0,0.14)" },
    ".cm-line.vc-conflict-theirs": { backgroundColor: "rgba(53,224,224,0.10)" },
  },
  { dark: true },
);

const conflictHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const cls = line.text.startsWith("<<<<<<<")
        ? "vc-conflict-ours"
        : line.text.startsWith("=======")
          ? "vc-conflict-sep"
          : line.text.startsWith(">>>>>>>")
            ? "vc-conflict-theirs"
            : null;
      if (cls) builder.add(line.from, line.from, Decoration.line({ class: cls }));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export function FileEditorModal() {
  const editingFile = useGame((s) => s.editingFile);
  const engine = useGame((s) => s.engine);
  const closeEditor = useGame((s) => s.closeEditor);
  const refreshAfterEdit = useGame((s) => s.refreshAfterEdit);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!editingFile || !engine || !hostRef.current) return;
    let disposed = false;

    const save = async (view: EditorView) => {
      await engine.writeFile(editingFile, view.state.doc.toString());
      await refreshAfterEdit();
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    };

    void (async () => {
      let content = "";
      try {
        content = await engine.readFile(editingFile);
      } catch {
        // new file
      }
      if (disposed || !hostRef.current) return;
      const view: EditorView = new EditorView({
        state: EditorState.create({
          doc: content,
          extensions: [
            lineNumbers(),
            history(),
            highlightActiveLine(),
            keymap.of([
              {
                key: "Mod-s",
                run: (v) => {
                  void save(v);
                  return true;
                },
              },
              ...defaultKeymap,
              ...historyKeymap,
            ]),
            theme,
            conflictHighlighter,
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setDirty(true);
            }),
            EditorView.lineWrapping,
          ],
        }),
        parent: hostRef.current,
      });
      viewRef.current = view;
      view.focus();
    })();

    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      setDirty(false);
    };
  }, [editingFile, engine, refreshAfterEdit]);

  if (!editingFile) return null;

  const saveAndClose = async () => {
    const view = viewRef.current;
    if (view && engine) {
      await engine.writeFile(editingFile, view.state.doc.toString());
      await refreshAfterEdit();
    }
    closeEditor();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Editing ${editingFile}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") closeEditor();
      }}
    >
      <PixelPanel
        tone="amber"
        title={`✎ ${editingFile}${dirty ? " •" : ""}`}
        className="h-[min(80vh,600px)] w-full max-w-3xl"
        actions={
          <span className="flex items-center gap-2">
            {saved && <span className="text-phos">saved ✓</span>}
          </span>
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line p-2.5">
            <p className="text-[11px] text-muted">
              Ctrl+S to save without closing · Esc to cancel
            </p>
            <div className="flex gap-2">
              <PixelButton variant="ghost" tone="line" onClick={closeEditor}>
                Cancel
              </PixelButton>
              <PixelButton tone="amber" onClick={() => void saveAndClose()}>
                Save
              </PixelButton>
            </div>
          </div>
        </div>
      </PixelPanel>
    </div>
  );
}
