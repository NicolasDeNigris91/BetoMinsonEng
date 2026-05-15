"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, achados, fotos, vistorias, categoriaEnum } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { deleteFotosFromStorage } from "@/lib/foto-storage";
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

function assertEditable(ctx: VistoriaCtx) {
  if (ctx.vistoriaStatus !== "rascunho") {
    throw new Error("Vistoria já finalizada. Reabra antes de editar.");
  }
}

export async function setAchadoStateInVistoriaAction(
  vistoriaId: string,
  achadoId: string,
  state: "none" | "persiste" | "resolvido" | "nota",
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

  let fotosToCleanup: { arquivoPath: string; thumbPath: string }[] = [];

  await db.transaction(async (tx) => {
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
}

export async function createAchadoAction(
  vistoriaId: string,
  _prev: NovoAchadoState,
  formData: FormData,
): Promise<NovoAchadoState> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

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
  assertEditable(ctx);

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
  return {};
}

export async function deleteAchadoAction(
  achadoId: string,
  vistoriaId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

  const [achado] = await db
    .select({
      vistoriaOrigemId: achados.vistoriaOrigemId,
    })
    .from(achados)
    .where(eq(achados.id, achadoId))
    .limit(1);

  if (!achado) return;

  if (achado.vistoriaOrigemId !== vistoriaId) {
    throw new Error(
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
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

  if (achadoIdsInOrder.length === 0) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: achados.id, vistoriaOrigemId: achados.vistoriaOrigemId })
      .from(achados)
      .where(inArray(achados.id, achadoIdsInOrder));

    const validIds = new Set(
      rows
        .filter((r) => r.vistoriaOrigemId === vistoriaId)
        .map((r) => r.id),
    );

    for (const id of achadoIdsInOrder) {
      if (!validIds.has(id)) {
        throw new Error("Achado nao pertence a esta vistoria.");
      }
    }

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
}

const observacoesSchema = z.object({
  observacoesGerais: z.string().trim().optional().or(z.literal("")),
});

export async function updateObservacoesAction(
  vistoriaId: string,
  formData: FormData,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

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
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  if (ctx.vistoriaStatus === "finalizada") {
    throw new Error("Vistoria finalizada. Reabra antes de excluir.");
  }

  const fotosToCleanup = await db
    .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .where(eq(achadoEventos.vistoriaId, vistoriaId));

  await db.delete(vistorias).where(eq(vistorias.id, vistoriaId));
  await deleteFotosFromStorage(fotosToCleanup);

  redirect(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}`,
  );
}

