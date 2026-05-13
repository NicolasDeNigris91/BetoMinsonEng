"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, fotos, unidades, vistorias } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { deleteFotosFromStorage } from "@/lib/foto-storage";
import { todayISO } from "@/lib/format";
import { vistoriaContext } from "@/lib/vistoria-context";

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
  await requireSession();

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
  redirect(
    `/empreendimentos/${unidade.empreendimentoId}/unidades/${unidadeId}/vistorias/${created.id}`,
  );
}

export async function deleteVistoriaAction(vistoriaId: string): Promise<void> {
  await requireSession();
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
