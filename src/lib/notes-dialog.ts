import { create } from "zustand";

/**
 * Open/closed state for the page's prose dialog (Lesson notes on a mission,
 * About on the playground).
 *
 * It is a module singleton rather than context on purpose: the button lives
 * inside the next/dynamic ssr:false game screen while the dialog wraps the
 * server-rendered prose that sits beside that boundary, so the two never share
 * a React parent. They do share this module.
 */
interface NotesDialogState {
  open: boolean;
  openNotes(): void;
  closeNotes(): void;
}

export const useNotesDialog = create<NotesDialogState>((set) => ({
  open: false,
  openNotes: () => set({ open: true }),
  closeNotes: () => set({ open: false }),
}));
