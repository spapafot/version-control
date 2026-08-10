import type { ReactNode, ButtonHTMLAttributes } from "react";

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
  actions,
  className = "",
  bodyClassName = "",
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
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
            <span className="truncate">{title}</span>
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
