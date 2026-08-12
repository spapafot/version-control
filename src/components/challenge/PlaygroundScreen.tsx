"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useGame } from "@/lib/game-store";
import { useNotesDialog } from "@/lib/notes-dialog";
import { GameHeader } from "@/components/layout/GameHeader";
import { FileExplorer } from "@/components/file-explorer/FileExplorer";
import { GitGraph } from "@/components/git-graph/GitGraph";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { FileEditorModal } from "@/components/editor/FileEditorModal";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";

const BANNER =
  "\x1b[38;2;61;255;116mPLAYGROUND\x1b[0m: a Git sandbox with no missions and nothing to score.\n" +
  "Start with \x1b[38;2;255;176;0mgit init\x1b[0m, make files with \x1b[38;2;255;176;0mecho \"...\" > file.txt\x1b[0m, and break whatever you like.\n" +
  "Type \x1b[38;2;255;176;0mhelp\x1b[0m to see every command.";

export function PlaygroundScreen() {
  const loadPlayground = useGame((s) => s.loadPlayground);
  const reset = useGame((s) => s.reset);
  const ready = useGame((s) => s.slug === null && s.state !== null);
  const openNotes = useNotesDialog((s) => s.openNotes);

  useEffect(() => {
    void loadPlayground();
  }, [loadPlayground]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <HudLabel cursor tone="phos">
          Starting playground
        </HudLabel>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col gap-2 bg-ink p-2">
      <GameHeader
        right={
          <div className="flex items-center gap-2">
            <HudLabel tone="amber">Playground</HudLabel>
            {/* the About text used to sit under the sandbox; it is a dialog
                now so the sandbox fits one screen */}
            <PixelButton variant="ghost" tone="amber" onClick={openNotes}>
              ▪ About
            </PixelButton>
            <PixelButton variant="ghost" tone="red" onClick={() => void reset()}>
              ↺ Reset
            </PixelButton>
            <Link prefetch={false} href="/stages/">
              <PixelButton variant="ghost" tone="line">
                Missions
              </PixelButton>
            </Link>
          </div>
        }
      />
      <div className="grid flex-1 grid-cols-1 gap-2 lg:min-h-0 lg:grid-rows-[minmax(200px,1fr)_minmax(220px,1fr)]">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,2fr)_3fr] lg:min-h-0">
          <PixelPanel
            tone="line"
            title="▪ Files"
            className="h-56 md:h-64 lg:h-auto lg:min-h-0"
            bodyClassName="min-h-0"
          >
            <FileExplorer />
          </PixelPanel>
          <PixelPanel
            tone="line"
            title="⧉ Git Graph"
            className="h-56 md:h-64 lg:h-auto lg:min-h-0"
            bodyClassName="min-h-0"
          >
            <GitGraph />
          </PixelPanel>
        </div>
        <PixelPanel
          tone="phos"
          title="▸ Terminal"
          className="h-80 lg:h-auto lg:min-h-0"
          bodyClassName="min-h-0"
        >
          <TerminalPanel banner={BANNER} />
        </PixelPanel>
      </div>
      <FileEditorModal />
    </div>
  );
}
