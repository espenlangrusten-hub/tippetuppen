import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Tippetuppen – dagens norske fotballspill";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

/**
 * The share card. Two things it deliberately avoids:
 *
 * Emoji — Satori draws no glyph for one unless an emoji font is supplied, so the ⚽
 * that used to sit in the badge rendered as an empty red square on every share.
 * The mark is built from plain rectangles instead, matching icon.svg.
 *
 * System fonts — the site's wordmark is Barlow Condensed, so the card loaded Arial
 * and looked like a different site. The face is already a dependency; it is read
 * from disk at build time.
 */
const font = (weight: 700 | 900) =>
  readFileSync(path.join(process.cwd(), "node_modules/@fontsource/barlow-condensed/files", `barlow-condensed-latin-${weight}-normal.woff`));

const RED = "#ba0c2f";
const BLUE = "#00205b";
const SNOW = "#f4f7fb";

/** The flag from icon.svg, drawn with rectangles because Satori has no SVG paths. */
function FlagMark({ size: s }: { size: number }) {
  const u = s / 64;
  return (
    <div style={{ display: "flex", position: "relative", width: s, height: s, borderRadius: 13 * u, background: RED, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 16 * u, top: 0, width: 16 * u, height: s, background: SNOW }} />
      <div style={{ position: "absolute", left: 0, top: 24 * u, width: s, height: 16 * u, background: SNOW }} />
      <div style={{ position: "absolute", left: 20 * u, top: 0, width: 8 * u, height: s, background: BLUE }} />
      <div style={{ position: "absolute", left: 0, top: 28 * u, width: s, height: 8 * u, background: BLUE }} />
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          color: SNOW,
          background: "linear-gradient(135deg, #0b1020 0%, #121f3e 65%, #00205b 100%)",
          fontFamily: "Barlow Condensed",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <FlagMark size={72} />
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase" }}>Tippetuppen</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, lineHeight: 1, fontWeight: 900, letterSpacing: -1 }}>To norske fotballspill.</div>
          <div style={{ marginTop: 20, fontSize: 46, color: "#c9d4e7" }}>Én ny utfordring hver dag.</div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 34, fontWeight: 700 }}>
          <div style={{ display: "flex", padding: "12px 28px", borderRadius: 999, background: RED }}>Mangler XI</div>
          <div style={{ display: "flex", padding: "12px 28px", borderRadius: 999, background: "#f4c542", color: "#0b1020" }}>Målløs</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Barlow Condensed", data: font(700), weight: 700, style: "normal" },
        { name: "Barlow Condensed", data: font(900), weight: 900, style: "normal" },
      ],
    },
  );
}
