"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  fotos,
  unidades,
  vistorias,
} from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { deleteFotosFromStorage } from "@/lib/foto-storage";
import { todayISO } from "@/lib/format";
import { vistoriaContext } from "@/lib/vistoria-context";
import { invalidateAchados, invalidateVistorias } from "@/lib/cache-tags";

const novaVistoriaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  vistoriadorNome: z.string().trim().max(200).optional().or(z.literal("")),
});

export type NovaVistoriaState = {
  fieldErrors?: Record<string, string>;
  error?: string;
};

export async function createVistoriaAction(
  unidadeId: string,
  _prev: NovaVistoriaState,
  formData: FormData,
): Promise<NovaVistoriaState> {
  await requireMutation();

  const parsed = novaVistoriaSchema.safeParse({
    data: formData.get("data") || todayISO(),
    vistoriadorNome: formData.get("vistoriadorNome"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const [unidade] = await db
    .select({ empreendimentoId: unidades.empreendimentoId })
    .from(unidades)
    .where(eq(unidades.id, unidadeId))
    .limit(1);

  if (!unidade) {
    return { error: "Unidade não encontrada." };
  }

  const [created] = await db
    .insert(vistorias)
    .values({
      unidadeId,
      data: parsed.data.data,
      vistoriadorNome: parsed.data.vistoriadorNome || null,
      status: "rascunho",
    })
    .returning({ id: vistorias.id });

  revalidatePath(`/empreendimentos/${unidade.empreendimentoId}/unidades/${unidadeId}`);
  invalidateVistorias();
  redirect(
    `/empreendimentos/${unidade.empreendimentoId}/unidades/${unidadeId}/vistorias/${created.id}`,
  );
}

export async function deleteVistoriaAction(vistoriaId: string): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  if (ctx.vistoriaStatus === "finalizada") {
    throw new Error(
      "Vistoria finalizada não pode ser excluída. Reabra antes ou apague achados específicos.",
    );
  }

  const fotosToCleanup = await db
    .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .where(eq(achadoEventos.vistoriaId, vistoriaId));

  await db.delete(vistorias).where(eq(vistorias.id, vistoriaId));
  await deleteFotosFromStorage(fotosToCleanup);

  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}`,
  );
  invalidateVistorias();
  invalidateAchados();
  redirect(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}`,
  );
}

export async function listVistoriasFromUnidade(unidadeId: string) {
  return db
    .select()
    .from(vistorias)
    .where(eq(vistorias.unidadeId, unidadeId))
    .orderBy(asc(vistorias.data));
}

/**
 * Marca/desmarca um achado como resolvido sem criar nova vistoria. O evento
 * "resolvido" e gravado na propria vistoria de origem do achado, ao lado do
 * evento "criado".
 *
 * - `customCreatedAt` (opcional): permite registrar a resolucao com data/hora
 *   passada (cenario: "o conserto aconteceu sexta, estou registrando segunda").
 *   Se omitido, usa o momento atual.
 * - Retorna `{ eventoId }` quando next="resolvido" pra que o cliente possa
 *   anexar uma foto de comprovacao ao evento via /api/upload.
 *
 * Funciona mesmo em vistorias finalizadas (operacao retroativa por design).
 */
export async function resolveAchadoRetroactiveAction(
  achadoId: string,
  next: "resolvido" | "none",
  customCreatedAt?: string,
): Promise<{ eventoId: string | null }> {
  await requireMutation();

  let revalidateUrl: string | null = null;
  let fotosToCleanup: { arquivoPath: string; thumbPath: string }[] = [];
  let returnedEventoId: string | null = null;

  await db.transaction(async (tx) => {
    const [achado] = await tx
      .select({
        id: achados.id,
        unidadeId: achados.unidadeId,
        vistoriaOrigemId: achados.vistoriaOrigemId,
      })
      .from(achados)
      .where(eq(achados.id, achadoId))
      .limit(1);
    if (!achado) throw new Error("Achado não encontrado.");

    const [unidade] = await tx
      .select({ empreendimentoId: unidades.empreendimentoId })
      .from(unidades)
      .where(eq(unidades.id, achado.unidadeId))
      .limit(1);
    if (unidade) {
      revalidateUrl = `/empreendimentos/${unidade.empreendimentoId}/unidades/${achado.unidadeId}`;
    }

    // Procura por um evento "resolvido" existente pra este achado nesta
    // vistoria de origem — evita duplicar.
    const [existingResolvido] = await tx
      .select({ id: achadoEventos.id })
      .from(achadoEventos)
      .where(
        and(
          eq(achadoEventos.achadoId, achadoId),
          eq(achadoEventos.vistoriaId, achado.vistoriaOrigemId),
          eq(achadoEventos.tipo, "resolvido"),
        ),
      )
      .limit(1);

    if (next === "resolvido") {
      if (existingResolvido) {
        returnedEventoId = existingResolvido.id;
        // Se o usuario passou uma data customizada, atualiza o evento ja
        // existente. Sem date custom, deixa o que ja estava.
        if (customCreatedAt) {
          await tx
            .update(achadoEventos)
            .set({ createdAt: new Date(customCreatedAt) })
            .where(eq(achadoEventos.id, existingResolvido.id));
        }
      } else {
        const insertValues: typeof achadoEventos.$inferInsert = {
          achadoId,
          vistoriaId: achado.vistoriaOrigemId,
          tipo: "resolvido",
        };
        if (customCreatedAt) {
          insertValues.createdAt = new Date(customCreatedAt);
        }
        const [created] = await tx
          .insert(achadoEventos)
          .values(insertValues)
          .returning({ id: achadoEventos.id });
        returnedEventoId = created.id;
      }
      await tx
        .update(achados)
        .set({
          status: "resolvido",
          vistoriaResolvidoId: achado.vistoriaOrigemId,
        })
        .where(eq(achados.id, achadoId));
    } else {
      // next === "none" — desfaz
      if (existingResolvido) {
        fotosToCleanup = await tx
          .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
          .from(fotos)
          .where(eq(fotos.achadoEventoId, existingResolvido.id));
        await tx
          .delete(achadoEventos)
          .where(eq(achadoEventos.id, existingResolvido.id));
      }
      await tx
        .update(achados)
        .set({ status: "aberto", vistoriaResolvidoId: null })
        .where(eq(achados.id, achadoId));
    }
  });

  await deleteFotosFromStorage(fotosToCleanup);
  if (revalidateUrl) revalidatePath(revalidateUrl);
  invalidateAchados();
  return { eventoId: returnedEventoId };
}
