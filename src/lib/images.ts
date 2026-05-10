import "server-only";
import sharp from "sharp";

const ORIGINAL_MAX_DIMENSION = 2000;
const THUMB_MAX_DIMENSION = 480;
const JPEG_QUALITY = 85;

export type ProcessedImage = {
  original: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  contentType: "image/jpeg";
  ext: "jpg";
};

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const pipeline = sharp(input, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();

  const original = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: ORIGINAL_MAX_DIMENSION,
      height: ORIGINAL_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const thumb = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: THUMB_MAX_DIMENSION,
      height: THUMB_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();

  return {
    original,
    thumb,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    contentType: "image/jpeg",
    ext: "jpg",
  };
}
