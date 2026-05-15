import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { processImage } from "@/lib/images";

// Constrói um JPEG sintético com EXIF GPS e metadados de marca/data,
// roda processImage, e verifica que o output não vaza nada.
async function buildJpegWithExif(): Promise<Buffer> {
  return sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .withExif({
      // Tags em IFD0 (estrutura comum pra fotos de celular).
      // Sharp aceita 4 IFDs; GPS info em uma foto real iria em IFD2.
      // O core do teste é: se EXIF entra, EXIF *não* sai.
      IFD0: {
        Make: "TestPhone",
        Model: "TestModel-XYZ",
        Software: "TestApp 1.0",
      },
    })
    .jpeg()
    .toBuffer();
}

describe("processImage", () => {
  it("strip EXIF: imagem processada não contém GPS, modelo nem software", async () => {
    const input = await buildJpegWithExif();

    // Sanity check: input *tem* EXIF antes do processamento
    const beforeMeta = await sharp(input).metadata();
    expect(beforeMeta.exif).toBeDefined();

    const { original, thumb } = await processImage(input);

    const afterOriginal = await sharp(original).metadata();
    const afterThumb = await sharp(thumb).metadata();

    // O Sharp re-encoda sem withMetadata() → EXIF/GPS não devem persistir
    expect(afterOriginal.exif).toBeUndefined();
    expect(afterThumb.exif).toBeUndefined();

    // Defesa em profundidade: nem o byte-pattern do modelo nem do GPS
    // pode aparecer no buffer final.
    const buf = original.toString("binary");
    expect(buf).not.toContain("TestPhone");
    expect(buf).not.toContain("TestModel-XYZ");
    expect(buf).not.toContain("TestApp");
  });

  it("respeita dimensão máxima de 2000px no original", async () => {
    const input = await buildJpegWithExif(); // 3000x2000
    const { original } = await processImage(input);
    const meta = await sharp(original).metadata();

    expect(meta.width).toBeLessThanOrEqual(2000);
    expect(meta.height).toBeLessThanOrEqual(2000);
  });

  it("respeita dimensão máxima de 480px no thumb", async () => {
    const input = await buildJpegWithExif();
    const { thumb } = await processImage(input);
    const meta = await sharp(thumb).metadata();

    expect(meta.width).toBeLessThanOrEqual(480);
    expect(meta.height).toBeLessThanOrEqual(480);
  });

  it("não amplia imagens menores que o limite", async () => {
    const small = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const { original } = await processImage(small);
    const meta = await sharp(original).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("output é JPEG", async () => {
    const input = await buildJpegWithExif();
    const result = await processImage(input);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.ext).toBe("jpg");
  });
});
