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
});
