"use server";

import { revalidatePath } from "next/cache";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, fotos } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { deleteFile } from "@/lib/storage";
import {
  actionData,
  actionError,
  type DataActionResult,
  type VoidActionResult,
} from "@/lib/action-result";
import {
  vistoriaContext,
  vistoriaContextFromEvento,
  vistoriaPath,
} from "@/lib/vistoria-context";

const FINALIZADA_DELETE_MSG = "Vistoria finalizada. Reabra antes de remover fotos.";
const FINALIZADA_EDIT_MSG = "Vistoria finalizada. Reabra antes de editar.";

export async function deleteFotoAction(
  fotoId: string,
): Promise<VoidActionResult> {
  await requireMutation();

  const [foto] = await db
    .select({
      id: fotos.id,
      arquivoPath: fotos.arquivoPath,
      thumbPath: fotos.thumbPath,
      eventoId: fotos.achadoEventoId,
      eventoTipo: achadoEventos.tipo,
    })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .where(eq(fotos.id, fotoId))
    .limit(1);
  if (!foto) return;

  const ctx = await vistoriaContextFromEvento(foto.eventoId);
  // Mesma regra do /api/upload e /api/photo/[id]/replace: vistoria
  // finalizada so trava o evento 'criado' (registro original). Fotos
  // de comprovacao em eventos retroativos (resolvido/persiste/nota)
  // podem ser corrigidas — caso contrario o engenheiro fica preso
  // com uma foto errada sem poder apagar.
  if (ctx.vistoriaStatus === "finalizada" && foto.eventoTipo === "criado") {
    return actionError(FINALIZADA_DELETE_MSG);
  }

  await db.delete(fotos).where(eq(fotos.id, fotoId));
  await Promise.all([
    deleteFile(foto.arquivoPath).catch(() => {}),
    deleteFile(foto.thumbPath).catch(() => {}),
  ]);

  revalidatePath(vistoriaPath(ctx));
}

const legendaSchema = z.string().trim().max(500);

export async function updateLegendaAction(
  fotoId: string,
  legenda: string,
): Promise<VoidActionResult> {
  await requireMutation();

  const parsed = legendaSchema.safeParse(legenda);
  if (!parsed.success) return actionError("Legenda inválida");

  const [foto] = await db
    .select({ eventoId: fotos.achadoEventoId })
    .from(fotos)
    .where(eq(fotos.id, fotoId))
    .limit(1);
  if (!foto) return;

  const ctx = await vistoriaContextFromEvento(foto.eventoId);
  if (ctx.vistoriaStatus === "finalizada") {
    return actionError(FINALIZADA_EDIT_MSG);
  }

  await db
    .update(fotos)
    .set({ legenda: parsed.data || null })
    .where(eq(fotos.id, fotoId));

  revalidatePath(vistoriaPath(ctx));
}

const notaSchema = z.string().trim().max(2000);

export async function updateEventoNotaAction(
  eventoId: string,
  nota: string,
): Promise<VoidActionResult> {
  await requireMutation();

  const parsed = notaSchema.safeParse(nota);
  if (!parsed.success) return actionError("Nota inválida");

  const ctx = await vistoriaContextFromEvento(eventoId);
  if (ctx.vistoriaStatus === "finalizada") {
    return actionError(FINALIZADA_EDIT_MSG);
  }

  await db
    .update(achadoEventos)
    .set({ notaExtra: parsed.data || null })
    .where(eq(achadoEventos.id, eventoId));

  revalidatePath(vistoriaPath(ctx));
}

/**
 * Reordena fotos de um mesmo evento. Recebe a lista de ids na ordem
 * desejada; valida que pertencem ao mesmo evento (defesa contra ids
 * forjados) e atribui ordem = 1..N. Bloqueado em vistoria finalizada.
 */
export async function reorderFotosAction(
  eventoId: string,
  fotoIdsInOrder: string[],
): Promise<VoidActionResult> {
  await requireMutation();

  if (fotoIdsInOrder.length === 0) return;

  const ctx = await vistoriaContextFromEvento(eventoId);
  if (ctx.vistoriaStatus === "finalizada") {
    return actionError(FINALIZADA_EDIT_MSG);
  }

  // Validacao de ownership ANTES da transacao pra poder retornar como
  // ActionError em vez de throw (que em prod tem msg ofuscada).
  const rows = await db
    .select({
      id: fotos.id,
      achadoEventoId: fotos.achadoEventoId,
    })
    .from(fotos)
    .where(inArray(fotos.id, fotoIdsInOrder));

  const validIds = new Set(
    rows.filter((r) => r.achadoEventoId === eventoId).map((r) => r.id),
  );
  for (const id of fotoIdsInOrder) {
    if (!validIds.has(id)) {
      return actionError("Foto nao pertence a este evento.");
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < fotoIdsInOrder.length; i++) {
      await tx
        .update(fotos)
        .set({ ordem: i + 1 })
        .where(eq(fotos.id, fotoIdsInOrder[i]));
    }
  });

  revalidatePath(vistoriaPath(ctx));
}

export async function ensureNotaEventoAction(
  vistoriaId: string,
  achadoId: string,
): Promise<DataActionResult<{ eventoId: string }>> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  if (ctx.vistoriaStatus === "finalizada") {
    return actionError(FINALIZADA_EDIT_MSG);
  }

  const existing = await db
    .select({ id: achadoEventos.id })
    .from(achadoEventos)
    .where(
      and(
        eq(achadoEventos.achadoId, achadoId),
        eq(achadoEventos.vistoriaId, vistoriaId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return actionData({ eventoId: existing[0].id });
  }

  const [created] = await db
    .insert(achadoEventos)
    .values({ achadoId, vistoriaId, tipo: "nota" })
    .returning({ id: achadoEventos.id });

  revalidatePath(vistoriaPath(ctx));
  return actionData({ eventoId: created.id });
}
