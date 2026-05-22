"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achados, escopoAchados, escopos, unidades } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { invalidateEscopos } from "@/lib/cache-tags";
import { escopoContext, escopoPath, escoposPath } from "@/lib/escopo-context";
import {
  actionError,
  type VoidActionResult,
} from "@/lib/action-result";

const novoEscopoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório")
    .max(200, "Nome muito longo"),
  descricao: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type NovoEscopoState = {
  fieldErrors?: Record<string, string>;
  error?: string;
};

export async function createEscopoAction(
  empreendimentoId: string,
  _prev: NovoEscopoState,
  formData: FormData,
): Promise<NovoEscopoState> {
  await requireMutation();

  const parsed = novoEscopoSchema.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const [created] = await db
    .insert(escopos)
    .values({
      empreendimentoId,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
    })
    .returning({ id: escopos.id });

  revalidatePath(escoposPath(empreendimentoId));
  invalidateEscopos();

  // Vai direto pro detalhe do escopo recem criado pra usuario ja comecar a
  // adicionar achados.
  redirect(escopoPath({ escopoId: created.id, empreendimentoId }));
}

export async function updateEscopoAction(
  escopoId: string,
  _prev: NovoEscopoState,
  formData: FormData,
): Promise<NovoEscopoState> {
  await requireMutation();
  const ctx = await escopoContext(escopoId);

  const parsed = novoEscopoSchema.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  await db
    .update(escopos)
    .set({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
      updatedAt: new Date(),
    })
    .where(eq(escopos.id, escopoId));

  revalidatePath(escoposPath(ctx.empreendimentoId));
  revalidatePath(escopoPath(ctx));
  invalidateEscopos();
  return {};
}

export async function deleteEscopoAction(
  escopoId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await escopoContext(escopoId);

  // CASCADE limpa escopo_achados automaticamente. Os achados em si nao sao
  // tocados — escopos so referenciam.
  await db.delete(escopos).where(eq(escopos.id, escopoId));

  invalidateEscopos();
  redirect(escoposPath(ctx.empreendimentoId));
}

/**
 * Adiciona achados a um escopo. Valida que TODOS os achados pertencem a
 * unidades do mesmo empreendimento do escopo — protege contra id forjado de
 * outro empreendimento. Achados ja presentes sao ignorados (idempotente).
 */
export async function addAchadosToEscopoAction(
  escopoId: string,
  achadoIds: string[],
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await escopoContext(escopoId);

  if (achadoIds.length === 0) return;

  // Authz: cada achado precisa estar numa unidade desse empreendimento.
  const validRows = await db
    .select({ id: achados.id })
    .from(achados)
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(
      and(
        inArray(achados.id, achadoIds),
        eq(unidades.empreendimentoId, ctx.empreendimentoId),
      ),
    );
  const validSet = new Set(validRows.map((r) => r.id));
  const invalid = achadoIds.filter((id) => !validSet.has(id));
  if (invalid.length > 0) {
    return actionError(
      "Um ou mais achados nao pertencem a este empreendimento.",
    );
  }

  await db.transaction(async (tx) => {
    // Calcular ordem inicial = max(ordem) + 1 do escopo atual.
    const [maxRow] = await tx
      .select({
        max: sql<number>`coalesce(max(${escopoAchados.ordem}), 0)::int`,
      })
      .from(escopoAchados)
      .where(eq(escopoAchados.escopoId, escopoId));
    let proximaOrdem = Number(maxRow?.max ?? 0) + 1;

    // ON CONFLICT DO NOTHING — idempotente. Reinserir achado ja presente
    // nao gera erro nem duplica.
    for (const achadoId of achadoIds) {
      await tx
        .insert(escopoAchados)
        .values({
          escopoId,
          achadoId,
          ordem: proximaOrdem,
        })
        .onConflictDoNothing();
      proximaOrdem++;
    }

    // Atualizar updated_at do escopo pra refletir mudanca de conteudo.
    await tx
      .update(escopos)
      .set({ updatedAt: new Date() })
      .where(eq(escopos.id, escopoId));
  });

  revalidatePath(escopoPath(ctx));
  revalidatePath(escoposPath(ctx.empreendimentoId));
  invalidateEscopos();
}

export async function removeAchadoFromEscopoAction(
  escopoId: string,
  achadoId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await escopoContext(escopoId);

  await db
    .delete(escopoAchados)
    .where(
      and(
        eq(escopoAchados.escopoId, escopoId),
        eq(escopoAchados.achadoId, achadoId),
      ),
    );

  await db
    .update(escopos)
    .set({ updatedAt: new Date() })
    .where(eq(escopos.id, escopoId));

  revalidatePath(escopoPath(ctx));
  revalidatePath(escoposPath(ctx.empreendimentoId));
  invalidateEscopos();
}
