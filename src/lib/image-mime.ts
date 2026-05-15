// Validação de tipo de imagem por magic bytes (assinatura nos primeiros
// bytes do arquivo). Necessário porque `File.type` vem do cliente e é
// trivial de spoofar (basta renomear .exe pra .jpg ou trocar o
// content-type no devtools).
//
// Tipos aceitos: os mesmos do <input accept=...> em photo-uploader.tsx.

export type DetectedImageKind =
  | "jpeg"
  | "png"
  | "webp"
  | "heic"
  | "heif"
  | "unknown";

export function detectImageKind(buffer: Buffer): DetectedImageKind {
  if (buffer.length < 12) return "unknown";

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  // HEIC/HEIF: ISO BMFF box "ftyp" em offset 4, brand em offset 8.
  // Brands válidos: heic, heix, hevc, hevx (HEIC); mif1, msf1, heim, heis (HEIF).
  if (buffer.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.slice(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "heic";
    if (["mif1", "msf1", "heim", "heis"].includes(brand)) return "heif";
  }

  return "unknown";
}

export function isAcceptedImage(buffer: Buffer): boolean {
  return detectImageKind(buffer) !== "unknown";
}
