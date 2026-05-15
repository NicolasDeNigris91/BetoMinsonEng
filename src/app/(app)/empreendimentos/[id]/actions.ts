"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, fotos, unidades, vistorias } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { deleteFotosFromStorage } from "@/lib/foto-storage";
import {
  invalidateAchados,
  invalidateUnidades,
  invalidateVistorias,
} from "@/lib/cache-tags";

const unidadeSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  observacoes: z.string().trim().optional().or(z.literal("")),
});

export type UnidadeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function nextOrdem(empreendimentoId: string): Promise<number> {
  const rows = await db
    .select({ ordem: unidades.ordem })
    .from(unidades)
    .where(eq(unidades.empreendimentoId, empreendimentoId))
    .orderBy(asc(unidades.ordem));
  if (rows.length === 0) return 0;
  return rows[rows.length - 1].ordem + 1;
}

export async function createUnidadeAction(
  empreendimentoId: string,
  _prev: UnidadeFormState,
  formData: FormData,
): Promise<UnidadeFormState> {
  await requireMutation();

  const parsed = unidadeSchema.safeParse({
    nome: formData.get("nome"),
    observacoes: formData.get("observacoes"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const ordem = await nextOrdem(empreendimentoId);

  const [created] = await db
    .insert(unidades)
    .values({
      empreendimentoId,
      nome: parsed.data.nome,
      observacoes: parsed.data.observacoes || null,
      ordem,
    })
    .returning({ id: unidades.id });

  revalidatePath(`/empreendimentos/${empreendimentoId}`);
  invalidateUnidades();
  redirect(`/empreendimentos/${empreendimentoId}/unidades/${created.id}`);
}

export async function updateUnidadeAction(
  unidadeId: string,
  _prev: UnidadeFormState,
  formData: FormData,
): Promise<UnidadeFormState> {
  await requireMutation();

  const parsed = unidadeSchema.safeParse({
    nome: formData.get("nome"),
    observacoes: formData.get("observacoes"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const [updated] = await db
    .update(unidades)
    .set({
      nome: parsed.data.nome,
      observacoes: parsed.data.observacoes || null,
    })
    .where(eq(unidades.id, unidadeId))
    .returning({ empreendimentoId: unidades.empreendimentoId });

  if (updated) {
    revalidatePath(`/empreendimentos/${updated.empreendimentoId}`);
    revalidatePath(
      `/empreendimentos/${updated.empreendimentoId}/unidades/${unidadeId}`,
    );
    invalidateUnidades();
  }
  return {};
}

export async function deleteUnidadeAction(unidadeId: string): Promise<void> {
  await requireMutation();

  const fotosToCleanup = await db
    .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
    .where(eq(vistorias.unidadeId, unidadeId));

  const [deleted] = await db
    .delete(unidades)
    .where(eq(unidades.id, unidadeId))
    .returning({ empreendimentoId: unidades.empreendimentoId });

  await deleteFotosFromStorage(fotosToCleanup);

  if (deleted) {
    revalidatePath(`/empreendimentos/${deleted.empreendimentoId}`);
    // Cascade — unidade arrasta vistorias e achados juntos.
    invalidateUnidades();
    invalidateVistorias();
    invalidateAchados();
    redirect(`/empreendimentos/${deleted.empreendimentoId}`);
  } else {
    redirect("/empreendimentos");
  }
}
