"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { escopoShareTokens } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { env } from "@/lib/env";
import { escopoContext, escopoPath } from "@/lib/escopo-context";
import { invalidateEscopos } from "@/lib/cache-tags";

/**
 * Gera um link de profissional pro escopo. Nao expira por tempo — fica
 * ativo ate ser revogado pelo admin (revogadoEm IS NOT NULL).
 *
 * Multiplos tokens podem coexistir (ex: trocou de profissional e precisa
 * de novo link), mas a UI sugere revogar antes de gerar outro.
 */
export async function createEscopoShareTokenAction(
  escopoId: string,
): Promise<{ url: string; token: string }> {
  await requireMutation();
  const ctx = await escopoContext(escopoId);

  const token = randomBytes(24).toString("hex");

  await db.insert(escopoShareTokens).values({
    escopoId,
    token,
  });

  invalidateEscopos();
  revalidatePath(escopoPath(ctx));

  return {
    url: `${env.BASE_URL}/v/${token}/profissional`,
    token,
  };
}

/**
 * Marca o token como revogado (set revogadoEm = now). Nao deleta — preserva
 * historico pro admin saber quando foi cortado.
 */
export async function revokeEscopoShareTokenAction(
  escopoId: string,
  tokenId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await escopoContext(escopoId);

  await db
    .update(escopoShareTokens)
    .set({ revogadoEm: new Date() })
    .where(
      and(
        eq(escopoShareTokens.id, tokenId),
        eq(escopoShareTokens.escopoId, escopoId),
        // so revoga tokens ainda ativos — idempotente
        isNull(escopoShareTokens.revogadoEm),
      ),
    );

  invalidateEscopos();
  revalidatePath(escopoPath(ctx));
}
