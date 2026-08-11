import { Fragment } from "react";

/**
 * Renders lesson/mission text: blank lines split paragraphs, `backticks` become
 * code spans. No "use client", so both the client MissionPanel and the
 * server-rendered MissionBrief can share it.
 *
 * whitespace-pre-line keeps single newlines, which some lessons use to lay out
 * conflict markers and command output as a block. Prose paragraphs in
 * src/challenges are written as one long line each, so nothing else is affected.
 */
export function RichText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={`mb-2.5 whitespace-pre-line last:mb-0 ${className}`}>
          {para.split(/(`[^`]+`)/).map((part, j) =>
            part.startsWith("`") && part.endsWith("`") ? (
              <code
                key={j}
                className="rounded-none bg-raised px-1 py-0.5 font-mono text-[0.92em] text-amber"
              >
                {part.slice(1, -1)}
              </code>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  );
}
