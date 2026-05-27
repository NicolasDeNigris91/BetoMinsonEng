import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const alt = "DiMinson Engenharia — Vistorias e Inspeções Técnicas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoBuffer = readFileSync(
    join(process.cwd(), "public/logo-diminson.png"),
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#fbfcfe",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="DiMinson Engenharia" width={820} height={238} />
        <div
          style={{
            marginTop: 48,
            fontSize: 26,
            color: "#0f1e3a",
            opacity: 0.55,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          Vistorias e Inspeções Técnicas
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 12,
            background: "#ff8000",
          }}
        />
      </div>
    ),
    size,
  );
}
