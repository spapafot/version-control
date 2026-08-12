"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useNotesDialog } from "@/lib/notes-dialog";
import { PixelButton } from "@/components/ui/pixel";

const FOCUSABLE =
  'a[href], button:not([disabled]), summary, input, [tabindex]:not([tabindex="-1"])';

/**
 * Shows the page's server-rendered prose on demand instead of below the game.
 *
 * The children are the crawlable counterpart these ssr:false routes depend on
 * (MissionBrief, the playground About section), so they are rendered either
 * way: closed, they sit in the HTML under `hidden`, which keeps the h1 and the
 * body text that `pnpm seo:check` reads while leaving the screen to the game.
 * Do not swap this for conditional rendering — that empties the page again.
 */
export function NotesDialog({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const open = useNotesDialog((s) => s.open);
  const closeNotes = useNotesDialog((s) => s.closeNotes);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // the state is a module singleton, so following the next-mission link from
  // inside the dialog would otherwise land on the next mission with it open
  useEffect(() => {
    closeNotes();
  }, [pathname, closeNotes]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // the Close button, not the container: the global :focus-visible outline
    // would otherwise draw a ring around the whole dialog
    const entry = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (entry ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeNotes();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // capture, because the terminal's textarea swallows keys it recognises
    window.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open, closeNotes]);

  if (!open) return <div hidden>{children}</div>;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-ink/85 p-2 backdrop-blur-[2px] sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeNotes();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="power-on flex h-full w-full max-w-3xl flex-col outline-none"
      >
        <div className="flex shrink-0 items-center justify-end gap-3 pb-2">
          <span className="hud text-[10px] text-muted">Esc to close</span>
          <PixelButton variant="ghost" tone="line" onClick={closeNotes}>
            ✕ Close
          </PixelButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
