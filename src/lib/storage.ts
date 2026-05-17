import "server-only";
import { mkdir, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./env";

function uploadsRoot(): string {
  return path.resolve(env.UPLOADS_DIR);
}

function safeJoin(...parts: string[]): string {
  const root = uploadsRoot();
  const full = path.resolve(root, ...parts);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("Caminho inválido (path traversal)");
  }
  return full;
}

export async function ensureDir(relative: string): Promise<void> {
  const dir = safeJoin(relative);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveFile(
  relativePath: string,
  data: Buffer | Uint8Array,
): Promise<void> {
  const full = safeJoin(relativePath);
  const dir = path.dirname(full);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(full, data);
}

export async function readFileBuffer(relativePath: string): Promise<Buffer> {
  const full = safeJoin(relativePath);
  return readFile(full);
}

export async function deleteFile(relativePath: string): Promise<void> {
  const full = safeJoin(relativePath);
  if (existsSync(full)) {
    await unlink(full);
  }
  // rmdir best-effort no diretorio pai: cascade delete (achado/vistoria/emp)
  // remove todas as fotos de um evento, e sem isso a pasta fica abandonada
  // ate o filesystem encher de diretorios vazios. Quando ainda ha arquivos
  // (caso do /api/photo/replace, que mantem a foto nova no mesmo dir, ou
  // delete de uma foto entre varias do mesmo evento), o rmdir falha com
  // ENOTEMPTY e ignoramos.
  const parent = path.dirname(full);
  const root = uploadsRoot();
  if (parent !== root && parent.startsWith(root + path.sep)) {
    await rmdir(parent).catch(() => {});
  }
}

export function fileExists(relativePath: string): boolean {
  return existsSync(safeJoin(relativePath));
}
