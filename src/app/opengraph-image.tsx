import { ImageResponse } from "next/og";

export const alt = "Tippetuppen – dagens norske fotballspill";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "68px 76px",
        color: "#f4f7fb",
        background: "linear-gradient(135deg, #0b1020 0%, #121f3e 65%, #00205b 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 68, height: 68, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "#ba0c2f", fontSize: 38 }}>⚽</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase" }}>Tippetuppen</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 86, lineHeight: 1, fontWeight: 900, letterSpacing: -3 }}>To norske fotballspill.</div>
        <div style={{ marginTop: 22, fontSize: 42, color: "#c9d4e7" }}>Én ny utfordring hver dag.</div>
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 30, fontWeight: 700 }}>
        <div style={{ display: "flex", padding: "14px 24px", borderRadius: 999, background: "#ba0c2f" }}>Mangler XI</div>
        <div style={{ display: "flex", padding: "14px 24px", borderRadius: 999, background: "#f4c542", color: "#0b1020" }}>Målløs</div>
      </div>
    </div>,
    size,
  );
}
