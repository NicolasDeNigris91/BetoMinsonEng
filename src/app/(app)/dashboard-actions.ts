"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achados } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { invalidateAchados } from "@/lib/cache-tags";

const itemSchema = z.object({
  achadoId: z.string().uuid(),
  prazoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida"),
});

const payloadSchema = z.object({
  itens: z.array(itemSchema).min(1).max(100),
});

/**
 * Aplica prazo em lote — usado pelo banner "Definir prazos" do dashboard.
 * Recebe um array de { achadoId, prazoEm } e atualiza apenas os achados
 * que ainda estao em aberto E continuam sem prazo (evita sobrescrever
 * mudancas concorrentes feitas em outra aba).
 */
export async function setPrazosLoteAction(
  itens: { achadoId: string; prazoEm: string }[],
): Promise<{ updated: number }> {
  await requireMutation();

  const parsed = payloadSchema.safeParse({ itens });
  if (!parsed.success) {
    throw new Error("Dados invalidos.");
  }

  let updatedCount = 0;
  await db.transaction(async (tx) => {
    // Verifica primeiro quais ainda sao validos (aberto + sem prazo).
    // Defesa contra race condition se o user demorou no modal e algum
    // achado foi resolvido/teve prazo definido em outra aba.
    const validos = await tx
      .select({ id: achados.id })
      .from(achados)
      .where(inArray(achados.id, parsed.data.itens.map((i) => i.achadoId)));

    const validIds = new Set(validos.map((v) => v.id));

    for (const item of parsed.data.itens) {
      if (!validIds.has(item.achadoId)) continue;
      await tx
        .update(achados)
        .set({ prazoEm: item.prazoEm })
        .where(eq(achados.id, item.achadoId));
      updatedCount++;
    }
  });

  revalidatePath("/");
  invalidateAchados();
  return { updated: updatedCount };
}
