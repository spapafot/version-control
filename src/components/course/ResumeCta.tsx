"use client";

import Link from "next/link";
import { ALL_CHALLENGES, firstUnsolved } from "@/challenges";
import { useProgress } from "@/lib/progress";
import { PixelButton } from "@/components/ui/pixel";

/**
 * Start / Continue / certificate, driven by the persisted progress blob.
 *
 * First paint matches the prerender (empty blob → Start). After zustand
 * rehydrates, the same button becomes Continue at the first unsolved mission
 * so a returning player is not sent back to a world they already cleared.
 */
export function ResumeCta({
  startLabel,
  continueLabel,
  doneLabel = "Claim your certificate ▸",
  className,
}: {
  startLabel: string;
  continueLabel: string;
  doneLabel?: string;
  className?: string;
}) {
  const completed = useProgress((s) => s.completed);
  const resume = firstUnsolved(completed);
  const hasProgress = ALL_CHALLENGES.some((c) => completed[c.id]);

  const href = resume
    ? `/challenge/${resume.id}/`
    : hasProgress
      ? "/account/"
      : `/challenge/${ALL_CHALLENGES[0].id}/`;
  const label = resume
    ? hasProgress
      ? continueLabel
      : startLabel
    : doneLabel;

  return (
    <Link prefetch={false} href={href} className={className}>
      <PixelButton className="text-sm">{label}</PixelButton>
    </Link>
  );
}
