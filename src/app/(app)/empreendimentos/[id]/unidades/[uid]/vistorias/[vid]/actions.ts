"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, achados, fotos, vistorias, categoriaEnum } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { deleteFotosFromStorage } from "@/lib/foto-storage";
import { invalidateAchados, invalidateVistorias } from "@/lib/cache-tags";
import {
  actionError,
  type ActionError,
  type VoidActionResult,
} from "@/lib/action-result";
import {
  vistoriaContext,
  vistoriaPath,
  type VistoriaCtx,
} from "@/lib/vistoria-context";

const novoAchadoSchema = z.object({
  categoria: z.enum(categoriaEnum.enumValues),
  local: z.string().trim().max(300).optional().or(z.literal("")),
  descricao: z.string().trim().min(1, "Descrição é obrigatória"),
  prazoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .optional()
    .or(z.literal("")),
});

export type NovoAchadoState = {
  fieldErrors?: Record<string, string>;
  error?: string;
};

/**
 * Guarda de regra de negocio: vistoria precisa estar em rascunho pra
 * aceitar edicao. Retorna ActionError pra ser propagado como valor — em
 * producao Next ofusca msg de throws em server actions (ver
 * action-result.ts).
 */
function editableGuard(ctx: VistoriaCtx): ActionError | null {
  if (ctx.vistoriaStatus !== "rascunho") {
    return actionError("Vistoria já finalizada. Reabra antes de editar.");
  }
  return null;
}

export async function setAchadoStateInVistoriaAction(
  vistoriaId: string,
  achadoId: string,
  state: "none" | "persiste" | "resolvido" | "nota",
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  const guard = editableGuard(ctx);
  if (guard) return guard;

  let fotosToCleanup: { arquivoPath: string; thumbPath: string }[] = [];

  await db.transaction(async (tx) => {
    // Authz: garantir que o achado pertence a unidade da vistoria atual.
    const [achadoCheck] = await tx
      .select({ unidadeId: achados.unidadeId })
      .from(achados)
      .where(eq(achados.id, achadoId))
      .limit(1);
    if (!achadoCheck || achadoCheck.unidadeId !== ctx.unidadeId) {
      throw new Error("Achado nao pertence a esta unidade.");
    }

    const existing = await tx
      .select()
      .from(achadoEventos)
      .where(
        and(
          eq(achadoEventos.achadoId, achadoId),
          eq(achadoEventos.vistoriaId, vistoriaId),
        ),
      )
      .limit(1);

    const previousTipo = existing[0]?.tipo;

    if (state === "none") {
      if (existing.length > 0) {
        fotosToCleanup = await tx
          .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
          .from(fotos)
          .where(eq(fotos.achadoEventoId, existing[0].id));
        await tx
          .delete(achadoEventos)
          .where(eq(achadoEventos.id, existing[0].id));
      }
      if (previousTipo === "resolvido") {
        await tx
          .update(achados)
          .set({ status: "aberto", vistoriaResolvidoId: null })
          .where(eq(achados.id, achadoId));
      }
      return;
    }

    if (existing.length > 0) {
      // Preserve fotos and notaExtra by only updating tipo
      await tx
        .update(achadoEventos)
        .set({ tipo: state })
        .where(eq(achadoEventos.id, existing[0].id));
    } else {
      await tx.insert(achadoEventos).values({
        achadoId,
        vistoriaId,
        tipo: state,
      });
    }

    if (state === "resolvido") {
      await tx
        .update(achados)
        .set({ status: "resolvido", vistoriaResolvidoId: vistoriaId })
        .where(eq(achados.id, achadoId));
    } else if (previousTipo === "resolvido") {
      await tx
        .update(achados)
        .set({ status: "aberto", vistoriaResolvidoId: null })
        .where(eq(achados.id, achadoId));
    }
  });

  await deleteFotosFromStorage(fotosToCleanup);
  revalidatePath(vistoriaPath(ctx));
  invalidateAchados();
}

export async function createAchadoAction(
  vistoriaId: string,
  _prev: NovoAchadoState,
  formData: FormData,
): Promise<NovoAchadoState> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  const guard = editableGuard(ctx);
  if (guard) return { error: guard.error };

  const parsed = novoAchadoSchema.safeParse({
    categoria: formData.get("categoria"),
    local: formData.get("local"),
    descricao: formData.get("descricao"),
    prazoEm: formData.get("prazoEm"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  await db.transaction(async (tx) => {
    // Proximo ordem = max(ordem) + 1 dos achados criados nesta mesma
    // vistoria. Garante que cada novo achado vai pro final da lista, sem
    // colidir com reordenacoes ja salvas.
    const [maxRow] = await tx
      .select({
        max: sql<number>`coalesce(max(${achados.ordem}), 0)::int`,
      })
      .from(achados)
      .where(eq(achados.vistoriaOrigemId, vistoriaId));
    const proximoOrdem = Number(maxRow?.max ?? 0) + 1;

    const [achado] = await tx
      .insert(achados)
      .values({
        unidadeId: ctx.unidadeId,
        categoria: parsed.data.categoria,
        local: parsed.data.local || null,
        descricao: parsed.data.descricao,
        prazoEm: parsed.data.prazoEm || null,
        ordem: proximoOrdem,
        status: "aberto",
        vistoriaOrigemId: vistoriaId,
      })
      .returning({ id: achados.id });

    await tx.insert(achadoEventos).values({
      achadoId: achado.id,
      vistoriaId,
      tipo: "criado",
    });
  });

  revalidatePath(vistoriaPath(ctx));
  invalidateAchados();
  return {};
}

const updateAchadoSchema = z.object({
  categoria: z.enum(categoriaEnum.enumValues),
  local: z.string().trim().max(300).optional().or(z.literal("")),
  descricao: z.string().trim().min(1, "Descrição é obrigatória"),
  prazoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .optional()
    .or(z.literal("")),
});

export async function updateAchadoAction(
  achadoId: string,
  vistoriaId: string,
  _prev: NovoAchadoState,
  formData: FormData,
): Promise<NovoAchadoState> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  const guard = editableGuard(ctx);
  if (guard) return { error: guard.error };

  const parsed = updateAchadoSchema.safeParse({
    categoria: formData.get("categoria"),
    local: formData.get("local"),
    descricao: formData.get("descricao"),
    prazoEm: formData.get("prazoEm"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  // Authz: limita a edicao a achados da mesma unidade da vistoria do
  // contexto. Sem isso, um id forjado de outra unidade/empreendimento
  // passaria livre (single-user reduz mas nao zera o risco).
  const [achado] = await db
    .select({ unidadeId: achados.unidadeId })
    .from(achados)
    .where(eq(achados.id, achadoId))
    .limit(1);
  if (!achado || achado.unidadeId !== ctx.unidadeId) {
    return { error: "Achado nao encontrado ou nao pertence a esta unidade." };
  }

  await db
    .update(achados)
    .set({
      categoria: parsed.data.categoria,
      local: parsed.data.local || null,
      descricao: parsed.data.descricao,
      prazoEm: parsed.data.prazoEm || null,
    })
    .where(eq(achados.id, achadoId));

  revalidatePath(vistoriaPath(ctx));
  invalidateAchados();
  return {};
}

export async function deleteAchadoAction(
  achadoId: string,
  vistoriaId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  const guard = editableGuard(ctx);
  if (guard) return guard;

  const [achado] = await db
    .select({
      vistoriaOrigemId: achados.vistoriaOrigemId,
    })
    .from(achados)
    .where(eq(achados.id, achadoId))
    .limit(1);

  if (!achado) return;

  if (achado.vistoriaOrigemId !== vistoriaId) {
    return actionError(
      "Este achado foi criado em outra vistoria. Apague-o lá ou apenas marque como resolvido aqui.",
    );
  }

  const fotosToCleanup = await db
    .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .where(eq(achadoEventos.achadoId, achadoId));

  await db.delete(achados).where(eq(achados.id, achadoId));
  await deleteFotosFromStorage(fotosToCleanup);

  revalidatePath(vistoriaPath(ctx));
  invalidateAchados();
}

/**
 * Reordena achados criados nesta vistoria. Recebe a nova lista de ids na
 * ordem desejada e atribui ordem = 1..N. Valida que todos os ids pertencem
 * a vistoria (vistoriaOrigemId) — protege contra reordenar achado de outra
 * vistoria via id forjado.
 */
export async function reorderAchadosAction(
  vistoriaId: string,
  achadoIdsInOrder: string[],
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  const guard = editableGuard(ctx);
  if (guard) return guard;

  if (achadoIdsInOrder.length === 0) return;

  // Validacao de ownership feita ANTES da transacao pra poder retornar
  // como ActionError em vez de jogar throw (que seria ofuscado em prod).
  const rows = await db
    .select({ id: achados.id, vistoriaOrigemId: achados.vistoriaOrigemId })
    .from(achados)
    .where(inArray(achados.id, achadoIdsInOrder));

  const validIds = new Set(
    rows.filter((r) => r.vistoriaOrigemId === vistoriaId).map((r) => r.id),
  );
  for (const id of achadoIdsInOrder) {
    if (!validIds.has(id)) {
      return actionError("Achado nao pertence a esta vistoria.");
    }
  }

  await db.transaction(async (tx) => {
    // Atualiza um por um. Lista e curta o suficiente (<50) pra que N queries
    // sejam aceitaveis e mantem o codigo simples.
    for (let i = 0; i < achadoIdsInOrder.length; i++) {
      await tx
        .update(achados)
        .set({ ordem: i + 1 })
        .where(eq(achados.id, achadoIdsInOrder[i]));
    }
  });

  revalidatePath(vistoriaPath(ctx));
}

export async function finalizeVistoriaAction(
  vistoriaId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  await db
    .update(vistorias)
    .set({
      status: "finalizada",
      finalizadaEm: new Date(),
    })
    .where(eq(vistorias.id, vistoriaId));

  revalidatePath(vistoriaPath(ctx));
  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}`,
  );
  invalidateVistorias();
}

export async function reopenVistoriaAction(
  vistoriaId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  await db
    .update(vistorias)
    .set({
      status: "rascunho",
      finalizadaEm: null,
    })
    .where(eq(vistorias.id, vistoriaId));

  revalidatePath(vistoriaPath(ctx));
  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}`,
  );
  invalidateVistorias();
}

const observacoesSchema = z.object({
  observacoesGerais: z.string().trim().optional().or(z.literal("")),
});

export async function updateObservacoesAction(
  vistoriaId: string,
  formData: FormData,
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  const guard = editableGuard(ctx);
  if (guard) return guard;

  const parsed = observacoesSchema.safeParse({
    observacoesGerais: formData.get("observacoesGerais"),
  });
  if (!parsed.success) return;

  await db
    .update(vistorias)
    .set({ observacoesGerais: parsed.data.observacoesGerais || null })
    .where(eq(vistorias.id, vistoriaId));

  revalidatePath(vistoriaPath(ctx));
}

export async function deleteVistoriaFromEditPageAction(
  vistoriaId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  if (ctx.vistoriaStatus === "finalizada") {
    return actionError("Vistoria finalizada. Reabra antes de excluir.");
  }

  const fotosToCleanup = await db
    .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .where(eq(achadoEventos.vistoriaId, vistoriaId));

  await db.delete(vistorias).where(eq(vistorias.id, vistoriaId));
  await deleteFotosFromStorage(fotosToCleanup);
  invalidateVistorias();
  invalidateAchados();

  // redirect() joga NEXT_REDIRECT — sinal de sucesso, tratado pelo
  // isNextRedirectError no client.
  redirect(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}`,
  );
}

