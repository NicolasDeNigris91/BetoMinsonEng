"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, fotos, vistorias, unidades, achados } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { deleteFile } from "@/lib/storage";

async function pathBaseFromEvento(eventoId: string) {
  const [row] = await db
    .select({
      vistoriaId: achadoEventos.vistoriaId,
      vistoriaStatus: vistorias.status,
      unidadeId: vistorias.unidadeId,
      empreendimentoId: unidades.empreendimentoId,
    })
    .from(achadoEventos)
    .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .where(eq(achadoEventos.id, eventoId))
    .limit(1);

  if (!row) throw new Error("Evento não encontrado");
  return row;
}

export async function deleteFotoAction(fotoId: string): Promise<void> {
  await requireSession();

  const [foto] = await db
    .select({
      id: fotos.id,
      arquivoPath: fotos.arquivoPath,
      thumbPath: fotos.thumbPath,
      eventoId: fotos.achadoEventoId,
    })
    .from(fotos)
    .where(eq(fotos.id, fotoId))
    .limit(1);
  if (!foto) return;

  const ctx = await pathBaseFromEvento(foto.eventoId);
  if (ctx.vistoriaStatus === "finalizada") {
    throw new Error("Vistoria finalizada. Reabra antes de remover fotos.");
  }

  await db.delete(fotos).where(eq(fotos.id, fotoId));
  await deleteFile(foto.arquivoPath).catch(() => {});
  await deleteFile(foto.thumbPath).catch(() => {});

  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}/vistorias/${ctx.vistoriaId}`,
  );
}

const legendaSchema = z.string().trim().max(500);

export async function updateLegendaAction(
  fotoId: string,
  legenda: string,
): Promise<void> {
  await requireSession();

  const parsed = legendaSchema.safeParse(legenda);
  if (!parsed.success) throw new Error("Legenda inválida");

  const [foto] = await db
    .select({ eventoId: fotos.achadoEventoId })
    .from(fotos)
    .where(eq(fotos.id, fotoId))
    .limit(1);
  if (!foto) return;

  const ctx = await pathBaseFromEvento(foto.eventoId);
  if (ctx.vistoriaStatus === "finalizada") {
    throw new Error("Vistoria finalizada.");
  }

  await db
    .update(fotos)
    .set({ legenda: parsed.data || null })
    .where(eq(fotos.id, fotoId));

  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}/vistorias/${ctx.vistoriaId}`,
  );
}

const notaSchema = z.string().trim().max(2000);

export async function updateEventoNotaAction(
  eventoId: string,
  nota: string,
): Promise<void> {
  await requireSession();

  const parsed = notaSchema.safeParse(nota);
  if (!parsed.success) throw new Error("Nota inválida");

  const ctx = await pathBaseFromEvento(eventoId);
  if (ctx.vistoriaStatus === "finalizada") {
    throw new Error("Vistoria finalizada.");
  }

  await db
    .update(achadoEventos)
    .set({ notaExtra: parsed.data || null })
    .where(eq(achadoEventos.id, eventoId));

  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}/vistorias/${ctx.vistoriaId}`,
  );
}

export async function ensureNotaEventoAction(
  vistoriaId: string,
  achadoId: string,
): Promise<{ eventoId: string }> {
  await requireSession();

  const [v] = await db
    .select({ status: vistorias.status })
    .from(vistorias)
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);
  if (!v) throw new Error("Vistoria não encontrada");
  if (v.status === "finalizada") throw new Error("Vistoria finalizada.");

  const existing = await db
    .select()
    .from(achadoEventos)
    .where(
      and(
        eq(achadoEventos.achadoId, achadoId),
        eq(achadoEventos.vistoriaId, vistoriaId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { eventoId: existing[0].id };
  }

  const [created] = await db
    .insert(achadoEventos)
    .values({
      achadoId,
      vistoriaId,
      tipo: "nota",
    })
    .returning({ id: achadoEventos.id });

  // Don't revalidate here; caller will after upload completes
  // But we need to have the achado's unidade for a future revalidate call
  const [info] = await db
    .select({
      unidadeId: vistorias.unidadeId,
      empreendimentoId: unidades.empreendimentoId,
    })
    .from(vistorias)
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);
  if (info) {
    revalidatePath(
      `/empreendimentos/${info.empreendimentoId}/unidades/${info.unidadeId}/vistorias/${vistoriaId}`,
    );
  }
  void achados;

  return { eventoId: created.id };
}
