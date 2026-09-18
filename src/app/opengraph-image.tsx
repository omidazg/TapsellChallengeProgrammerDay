import { ImageResponse } from "next/og";

// next/og (Satori) can't load our self-hosted woff2 (Vazirmatn), and Persian
// text rendered without it would show as tofu boxes — so this image uses only
// Latin type (default Satori font) plus the brand mark drawn with shapes,
// never real Persian glyphs.
export const alt = "Tapsell Founders Arena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #002d47 0%, #013b5c 55%, #002d47 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
          {/* نشان برند: همان حلقهٔ آبی و نقطهٔ قرمز روی favicon.svg */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 220,
              height: 220,
              borderRadius: 48,
              background: "#00243a",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 140,
                height: 140,
                borderRadius: "50%",
                border: "20px solid #00b8e0",
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e10126", display: "flex" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 88, fontWeight: 900, color: "#ffffff", letterSpacing: -2, display: "flex" }}>
              TAPSELL
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, color: "#00b8e0", letterSpacing: 4, textTransform: "uppercase", display: "flex" }}>
              Founders Arena
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
