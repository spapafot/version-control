import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";

type Tone = "line" | "phos" | "amber" | "red";

const frameBg: Record<Tone, string> = {
  line: "bg-line",
  phos: "bg-phos-dim",
  amber: "bg-amber-dim",
  red: "bg-crt-red",
};

const toneText: Record<Tone, string> = {
  line: "text-muted",
  phos: "text-phos",
  amber: "text-amber",
  red: "text-crt-red",
};

/**
 * Chunky 8-bit panel: a clipped frame layer wrapping a clipped body layer,
 * because clip-path swallows real borders.
 */
export function PixelPanel({
  tone = "line",
  title,
  /** render the panel title as a heading when it is the real heading for a section */
  titleAs: TitleTag = "span",
  actions,
  className = "",
  bodyClassName = "",
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  titleAs?: "span" | "h2" | "h3";
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={`px-corners p-[2px] ${frameBg[tone]} ${className}`}>
      <div className="px-corners bg-panel flex h-full min-h-0 flex-col">
        {title !== undefined && (
          <div
            className={`hud flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-[11px] ${toneText[tone]}`}
          >
            <TitleTag className="truncate">{title}</TitleTag>
            {actions}
          </div>
        )}
        <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}

export function PixelButton({
  tone = "phos",
  variant = "solid",
  className = "",
  children,
  ...rest
}: {
  tone?: Tone;
  variant?: "solid" | "ghost";
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const solid: Record<Tone, string> = {
    line: "bg-line text-fg",
    phos: "bg-phos text-ink hover:brightness-110",
    amber: "bg-amber text-ink hover:brightness-110",
    red: "bg-crt-red text-ink hover:brightness-110",
  };
  const inner =
    variant === "solid"
      ? solid[tone]
      : `bg-raised ${toneText[tone]} hover:bg-line/60`;
  return (
    <button
      {...rest}
      className={`px-corners group inline-block p-[2px] ${frameBg[tone]} transition-transform active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      <span
        className={`px-corners hud flex items-center justify-center gap-2 px-4 py-2 text-xs ${inner}`}
      >
        {children}
      </span>
    </button>
  );
}

/** Segmented XP-style progress bar. */
export function PixelProgress({
  value,
  segments = 20,
  tone = "phos",
  className = "",
}: {
  value: number; // 0..1
  segments?: number;
  tone?: "phos" | "amber";
  className?: string;
}) {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * segments);
  const on =
    tone === "phos"
      ? "bg-phos [box-shadow:var(--glow-phos)]"
      : "bg-amber [box-shadow:var(--glow-amber)]";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`px-corners flex gap-[3px] bg-raised p-[3px] ${className}`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 ${i < filled ? on : "bg-line/50"}`}
        />
      ))}
    </div>
  );
}

/** Text input in the same clipped-frame style as the panels. */
export function PixelInput({
  tone = "line",
  className = "",
  ...rest
}: {
  tone?: Tone;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={`px-corners block p-[2px] ${frameBg[tone]} ${className}`}>
      <input
        {...rest}
        className="px-corners block w-full bg-raised px-3 py-2 font-mono text-sm text-fg placeholder:text-muted"
      />
    </span>
  );
}

/**
 * Label + control + optional hint/error row for the account forms.
 * Pass `aria-describedby={\`${id}-error\`}` (or `-hint`) on the input inside
 * when it should announce these; the ids below match that convention.
 */
export function PixelField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="hud text-[11px] text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-crt-red">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One multiple-choice answer: a letter key plus the option text.
 *
 * `state` covers both phases of a quiz question. During a run only "idle" and
 * "picked" occur; the review afterwards uses "correct" and "wrong" to mark up
 * what happened, and "missed" to point at the right answer on a question that
 * was answered wrongly or never reached.
 */
export function PixelChoice({
  letter,
  state = "idle",
  className = "",
  children,
  ...rest
}: {
  letter: string;
  state?: "idle" | "picked" | "correct" | "wrong" | "missed";
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const frame: Record<string, string> = {
    idle: "bg-line",
    picked: "bg-amber-dim",
    correct: "bg-phos-dim",
    wrong: "bg-crt-red",
    missed: "bg-phos-dim",
  };
  const body: Record<string, string> = {
    idle: "bg-raised text-fg hover:bg-line/60",
    picked: "bg-raised text-amber",
    correct: "bg-raised text-phos",
    wrong: "bg-raised text-crt-red",
    missed: "bg-raised text-phos",
  };
  const key: Record<string, string> = {
    idle: "bg-line text-muted",
    picked: "bg-amber text-ink",
    correct: "bg-phos text-ink",
    wrong: "bg-crt-red text-ink",
    missed: "bg-phos-dim text-ink",
  };
  return (
    <button
      {...rest}
      className={`px-corners block w-full p-[2px] text-left transition-transform enabled:active:translate-y-[2px] disabled:pointer-events-none ${frame[state]} ${className}`}
    >
      <span
        className={`px-corners flex items-start gap-3 px-3 py-2.5 text-sm ${body[state]}`}
      >
        <span
          className={`hud mt-px flex h-5 w-5 shrink-0 items-center justify-center text-[11px] ${key[state]}`}
          aria-hidden="true"
        >
          {letter}
        </span>
        {/* Body font, not mono: options are sentences at least as often as they
            are bare commands, and mono is reserved here for scores and times. */}
        <span className="min-w-0 flex-1 text-[13px] leading-relaxed">{children}</span>
      </span>
    </button>
  );
}

/** Small uppercase HUD label, optionally with a blinking block cursor. */
export function HudLabel({
  children,
  cursor = false,
  tone = "phos",
  className = "",
}: {
  children: ReactNode;
  cursor?: boolean;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={`hud text-[11px] ${toneText[tone]} ${className}`}>
      {children}
      {cursor && <span className="blink ml-1 inline-block">▮</span>}
    </span>
  );
}
