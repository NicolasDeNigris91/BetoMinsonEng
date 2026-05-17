import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

beforeAll(() => {
  // UPLOADS_DIR é lido por env.ts. Setar antes de qualquer import do
  // módulo storage (que faz path.resolve no momento da chamada).
  const tmp = mkdtempSync(path.join(tmpdir(), "rme-storage-test-"));
  process.env.UPLOADS_DIR = tmp;
});

describe("storage.safeJoin (via APIs públicas)", () => {
  it("rejeita path traversal com ../", async () => {
    const { saveFile } = await import("@/lib/storage");
    await expect(saveFile("../escapou.txt", Buffer.from("x"))).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("rejeita path traversal aninhado (a/b/../../../etc)", async () => {
    const { saveFile } = await import("@/lib/storage");
    await expect(
      saveFile("a/b/../../../etc/passwd", Buffer.from("x")),
    ).rejects.toThrow(/path traversal/i);
  });

  it("rejeita caminho absoluto fora do root (Windows)", async () => {
    const { saveFile } = await import("@/lib/storage");
    // No Windows, C:\... resolve absoluto e foge do root. No Linux, /etc faz o mesmo.
    const abs = process.platform === "win32" ? "C:\\Windows\\evil.txt" : "/etc/evil";
    await expect(saveFile(abs, Buffer.from("x"))).rejects.toThrow(
      /path traversal/i,
    );
  });

  it("aceita caminho relativo simples e o arquivo existe depois", async () => {
    const { saveFile, fileExists, deleteFile } = await import("@/lib/storage");
    await saveFile("subdir/ok.txt", Buffer.from("conteudo"));
    expect(fileExists("subdir/ok.txt")).toBe(true);
    await deleteFile("subdir/ok.txt");
  });

  it("deleteFile remove o diretorio pai quando fica vazio", async () => {
    const { saveFile, deleteFile } = await import("@/lib/storage");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = "evento-cleanup-1";
    await saveFile(`${dir}/foto.jpg`, Buffer.from("x"));
    const root = path.resolve(process.env.UPLOADS_DIR!);
    expect(existsSync(path.join(root, dir))).toBe(true);
    await deleteFile(`${dir}/foto.jpg`);
    expect(existsSync(path.join(root, dir))).toBe(false);
  });

  it("deleteFile mantem o diretorio pai quando ainda ha outros arquivos", async () => {
    const { saveFile, deleteFile } = await import("@/lib/storage");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = "evento-cleanup-2";
    await saveFile(`${dir}/foto-a.jpg`, Buffer.from("a"));
    await saveFile(`${dir}/foto-b.jpg`, Buffer.from("b"));
    await deleteFile(`${dir}/foto-a.jpg`);
    const root = path.resolve(process.env.UPLOADS_DIR!);
    expect(existsSync(path.join(root, dir))).toBe(true);
    expect(existsSync(path.join(root, dir, "foto-b.jpg"))).toBe(true);
    await deleteFile(`${dir}/foto-b.jpg`);
    expect(existsSync(path.join(root, dir))).toBe(false);
  });

  it("deleteFile nao tenta apagar a raiz de uploads", async () => {
    const { saveFile, deleteFile } = await import("@/lib/storage");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    await saveFile("solto-na-raiz.txt", Buffer.from("x"));
    const root = path.resolve(process.env.UPLOADS_DIR!);
    await deleteFile("solto-na-raiz.txt");
    // raiz precisa continuar existindo
    expect(existsSync(root)).toBe(true);
  });
});
