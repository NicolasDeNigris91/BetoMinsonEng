import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { detectImageKind, isAcceptedImage } from "@/lib/image-mime";

describe("detectImageKind", () => {
  it("identifica JPEG real (magic bytes FF D8 FF)", async () => {
    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();
    expect(detectImageKind(jpeg)).toBe("jpeg");
  });

  it("identifica PNG real (magic bytes 89 50 4E 47)", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 4, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(detectImageKind(png)).toBe("png");
  });

  it("identifica WEBP real (RIFF...WEBP)", async () => {
    const webp = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#fff" },
    })
      .webp()
      .toBuffer();
    expect(detectImageKind(webp)).toBe("webp");
  });

  it("rejeita executavel disfarcado de JPEG (Windows PE: MZ header)", () => {
    // PE/EXE comeca com 'MZ' (4D 5A). Renomear pra .jpg nao engana magic bytes.
    const fakeExe = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    ]);
    expect(detectImageKind(fakeExe)).toBe("unknown");
    expect(isAcceptedImage(fakeExe)).toBe(false);
  });

  it("rejeita HTML (caso de XSS via SVG-com-script renomeado)", () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect(detectImageKind(html)).toBe("unknown");
  });

  it("rejeita PDF disfarcado (PDF: %PDF)", () => {
    const pdf = Buffer.from("%PDF-1.4\n...");
    expect(detectImageKind(pdf)).toBe("unknown");
  });

  it("rejeita buffer muito pequeno (< 12 bytes)", () => {
    expect(detectImageKind(Buffer.from([0xff, 0xd8, 0xff]))).toBe("unknown");
  });

  it("rejeita buffer vazio", () => {
    expect(detectImageKind(Buffer.alloc(0))).toBe("unknown");
  });
});
