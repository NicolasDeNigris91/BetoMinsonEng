"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  achadoEventos,
  empreendimentos,
  fotos,
  unidades,
  vistorias,
} from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { deleteFotosFromStorage } from "@/lib/foto-storage";
import {
  invalidateAchados,
  invalidateEmpreendimentos,
  invalidateUnidades,
  invalidateVistorias,
} from "@/lib/cache-tags";

const empreendimentoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  cliente: z.string().trim().max(200).optional().or(z.literal("")),
  endereco: z.string().trim().optional().or(z.literal("")),
  observacoes: z.string().trim().optional().or(z.literal("")),
});

export type EmpreendimentoFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createEmpreendimentoAction(
  _prev: EmpreendimentoFormState,
  formData: FormData,
): Promise<EmpreendimentoFormState> {
  await requireMutation();

  const parsed = empreendimentoSchema.safeParse({
    nome: formData.get("nome"),
    cliente: formData.get("cliente"),
    endereco: formData.get("endereco"),
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

  const [created] = await db
    .insert(empreendimentos)
    .values({
      nome: parsed.data.nome,
      cliente: parsed.data.cliente || null,
      endereco: parsed.data.endereco || null,
      observacoes: parsed.data.observacoes || null,
    })
    .returning({ id: empreendimentos.id });

  revalidatePath("/empreendimentos");
  invalidateEmpreendimentos();
  redirect(`/empreendimentos/${created.id}`);
}

export async function updateEmpreendimentoAction(
  id: string,
  _prev: EmpreendimentoFormState,
  formData: FormData,
): Promise<EmpreendimentoFormState> {
  await requireMutation();

  const parsed = empreendimentoSchema.safeParse({
    nome: formData.get("nome"),
    cliente: formData.get("cliente"),
    endereco: formData.get("endereco"),
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

  await db
    .update(empreendimentos)
    .set({
      nome: parsed.data.nome,
      cliente: parsed.data.cliente || null,
      endereco: parsed.data.endereco || null,
      observacoes: parsed.data.observacoes || null,
    })
    .where(eq(empreendimentos.id, id));

  revalidatePath("/empreendimentos");
  revalidatePath(`/empreendimentos/${id}`);
  invalidateEmpreendimentos();
  return {};
}

export async function deleteEmpreendimentoAction(id: string): Promise<void> {
  await requireMutation();

  const fotosToCleanup = await db
    .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .where(eq(unidades.empreendimentoId, id));

  await db.delete(empreendimentos).where(eq(empreendimentos.id, id));
  await deleteFotosFromStorage(fotosToCleanup);

  revalidatePath("/empreendimentos");
  // Cascade delete remove tudo abaixo — invalida todas as colecoes.
  invalidateEmpreendimentos();
  invalidateUnidades();
  invalidateVistorias();
  invalidateAchados();
  redirect("/empreendimentos");
}
