"use client";

import { useGame } from "@/lib/game-store";
import type { FileStatus } from "@/git/types";
import { HudLabel } from "@/components/ui/pixel";

/**
 * The command → state feedback loop (spec §11): working directory and
 * staging area as two visible zones that update after every command.
 */
export function FileExplorer() {
  const state = useGame((s) => s.state);
  const openEditor = useGame((s) => s.openEditor);

  if (!state) return null;

  const byPath = new Map(state.status.map((f) => [f.path, f]));
  const files = state.workdir.map((f) => f.path);
  const staged = state.status.filter((f) => f.staged && !f.conflicted);
  const deletedStaged = staged.filter((f) => !files.includes(f.path));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <section>
        <HudLabel tone="line" className="mb-1.5 block">
          Working Directory
        </HudLabel>
        {files.length === 0 ? (
          <p className="px-1 text-xs text-muted">No files yet. Create one with `echo "..." &gt; file.txt`</p>
        ) : (
          <ul className="flex flex-col gap-[3px]">
            {files.map((path) => {
              const st = byPath.get(path);
              return (
                <li key={path}>
                  <button
                    onClick={() => openEditor(path)}
                    className="group flex w-full items-center justify-between gap-2 bg-raised px-2 py-1.5 text-left font-mono text-xs text-fg hover:bg-line/60"
                    title={`Open ${path} in the editor`}
                  >
                    <span className="truncate">
                      <span className="mr-1.5 text-muted" aria-hidden>
                        ▪
                      </span>
                      {path}
                    </span>
                    {st && <StatusBadge st={st} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <HudLabel tone="phos" className="mb-1.5 block">
          Staging Area
        </HudLabel>
        {staged.length === 0 ? (
          <p className="px-1 text-xs text-muted">
            Empty. `git add &lt;file&gt;` moves changes here.
          </p>
        ) : (
          <ul className="flex flex-col gap-[3px]">
            {[...staged.filter((f) => files.includes(f.path)), ...deletedStaged].map((f) => (
              <li
                key={f.path}
                className="flex items-center justify-between gap-2 border border-phos-dim/40 bg-raised px-2 py-1.5 font-mono text-xs text-phos"
              >
                <span className="truncate">{f.path}</span>
                <span className="hud shrink-0 text-[10px] text-phos-dim">
                  {f.staged === "added" ? "new" : f.staged === "deleted" ? "deleted" : "modified"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {state.stash.length > 0 && (
        <section>
          <HudLabel tone="amber" className="mb-1.5 block">
            Stash
          </HudLabel>
          <ul className="flex flex-col gap-[3px]">
            {state.stash.map((entry, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 border border-amber-dim/50 bg-raised px-2 py-1.5 font-mono text-xs text-amber"
                title={entry.files.join(", ")}
              >
                <span className="truncate">
                  <span className="mr-1.5 text-amber-dim" aria-hidden>
                    ▤
                  </span>
                  stash@{`{${i}}`}: {entry.label}
                </span>
                <span className="hud shrink-0 text-[10px] text-amber-dim">
                  {entry.files.length} {entry.files.length === 1 ? "file" : "files"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ st }: { st: FileStatus }) {
  if (st.conflicted)
    return <Badge text="conflict" className="bg-crt-red/20 text-crt-red border-crt-red/60" />;
  if (st.untracked)
    return <Badge text="untracked" className="bg-amber/10 text-amber border-amber-dim/60" />;
  if (st.unstaged === "modified")
    return <Badge text="modified" className="bg-amber/10 text-amber border-amber-dim/60" />;
  if (st.unstaged === "deleted")
    return <Badge text="deleted" className="bg-crt-red/15 text-crt-red border-crt-red/50" />;
  if (st.staged)
    return <Badge text="staged" className="bg-phos/10 text-phos border-phos-dim/60" />;
  return <Badge text="ok" className="text-muted border-line" />;
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`hud shrink-0 border px-1.5 py-0.5 text-[9px] ${className}`}>{text}</span>
  );
}
