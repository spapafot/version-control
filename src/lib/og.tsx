import type { ReactElement } from "react";

/** Facebook/X both crop to 1.91:1; 1200x630 is the safe canonical size. */
export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#050807";
const PANEL = "#0a120c";
const LINE = "#1c3322";
const PHOS = "#3dff74";
const AMBER = "#ffb000";
const MUTED = "#7ea98a";
const FG = "#d7f5e1";

/**
 * Shared social-card layout. Kept to plain flexbox and solid colors because
 * Satori (what ImageResponse renders with) supports only a subset of CSS.
 */
export function ogImage({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: INK,
        padding: "64px 72px",
        border: `8px solid ${LINE}`,
      }}
    >
      {/* brand. No ▚ glyph here: Satori falls back to a font without it and
          renders tofu, so the identity is carried by the palette and the
          commit-graph motif below instead. */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", width: 22, height: 22, backgroundColor: PHOS, marginRight: 14 }} />
        <div style={{ fontSize: 30, color: PHOS, letterSpacing: 2 }}>
          {"VersionControl.gr"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            backgroundColor: PANEL,
            border: `2px solid ${AMBER}`,
            color: AMBER,
            fontSize: 24,
            letterSpacing: 3,
            padding: "8px 18px",
            marginBottom: 28,
          }}
        >
          {eyebrow.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: title.length > 44 ? 66 : 82,
            lineHeight: 1.1,
            color: PHOS,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.4, color: FG, marginTop: 26, maxWidth: 940 }}>
          {subtitle}
        </div>
      </div>

      {/* commit-graph motif */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {[PHOS, PHOS, AMBER, PHOS, "#35e0e0", PHOS].map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: 34, height: 3, backgroundColor: LINE }} />}
              <div style={{ width: 18, height: 18, backgroundColor: c }} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, color: MUTED, letterSpacing: 2 }}>versioncontrol.gr</div>
      </div>
    </div>
  );
}
