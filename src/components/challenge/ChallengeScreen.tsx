"use client";

import { useEffect } from "react";
import { useGame } from "@/lib/game-store";
import { GameHeader } from "@/components/layout/GameHeader";
import { MissionPanel } from "./MissionPanel";
import { SuccessOverlay } from "./SuccessOverlay";
import { FileExplorer } from "@/components/file-explorer/FileExplorer";
import { GitGraph } from "@/components/git-graph/GitGraph";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { FileEditorModal } from "@/components/editor/FileEditorModal";
import { PixelPanel, HudLabel } from "@/components/ui/pixel";

const TERMINAL_BANNER =
  "\x1b[38;2;61;255;116mVersionControl.gr\x1b[0m: a real Git terminal.\n" +
  "Type \x1b[38;2;255;176;0mhelp\x1b[0m to see the available commands.";

export function ChallengeScreen({ slug }: { slug: string }) {
  const loadChallenge = useGame((s) => s.loadChallenge);
  const ready = useGame((s) => s.slug === slug && s.state !== null);

  useEffect(() => {
    void loadChallenge(slug);
  }, [slug, loadChallenge]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <HudLabel cursor tone="phos">
          Loading mission
        </HudLabel>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col gap-2 bg-ink p-2 lg:h-dvh lg:min-h-0">
      <GameHeader />
      {/* relative: the completion card anchors to this area's top-right corner
          on lg, which keeps it clear of the header and off the terminal */}
      <div className="relative grid flex-1 grid-cols-1 gap-2 lg:min-h-0 lg:grid-cols-[360px_1fr]">
        <div className="lg:min-h-0">
          <MissionPanel />
        </div>
        <div className="grid grid-cols-1 gap-2 lg:min-h-0 lg:grid-rows-[minmax(200px,1.1fr)_minmax(220px,1fr)]">
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
            <TerminalPanel banner={TERMINAL_BANNER} />
          </PixelPanel>
        </div>
        <SuccessOverlay />
      </div>
      <FileEditorModal />
    </div>
  );
}
