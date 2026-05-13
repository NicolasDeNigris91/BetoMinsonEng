import "server-only";
import { deleteFile } from "@/lib/storage";

/**
 * Apaga arquivos de fotos do storage em paralelo, tolerando falhas individuais.
 * Usar em cascateamentos onde a deleção do DB ja garante consistência —
 * vazar arquivo em disco é recuperável; recuperar consistência do DB nao.
 */
export async function deleteFotosFromStorage(
  paths: { arquivoPath: string; thumbPath: string }[],
): Promise<void> {
  if (paths.length === 0) return;
  const results = await Promise.allSettled(
    paths.flatMap((p) => [deleteFile(p.arquivoPath), deleteFile(p.thumbPath)]),
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.warn(
      `[foto-storage] ${failures.length}/${results.length} files failed to delete`,
      failures.map((f) => (f as PromiseRejectedResult).reason),
    );
  }
}
