"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { unidades, vistorias } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { invalidateVistorias } from "@/lib/cache-tags";
import { todayISO } from "@/lib/format";

/**
 * Cria uma vistoria em rascunho pra unidade escolhida usando data=hoje
 * e sem vistoriador. Redirect direto pra pagina da vistoria recem-criada
 * — alvo do botao "+ Vistoria" no card de empreendimento. Vistoriador e
 * data podem ser ajustados depois dentro da propria vistoria.
 */
export async function quickCreateVistoriaAction(unidadeId: string): Promise<void> {
  await requireMutation();

  const [unidade] = await db
    .select({ empreendimentoId: unidades.empreendimentoId })
    .from(unidades)
    .where(eq(unidades.id, unidadeId))
    .limit(1);

  if (!unidade) {
    throw new Error("Unidade nao encontrada.");
  }

  const [created] = await db
    .insert(vistorias)
    .values({
      unidadeId,
      data: todayISO(),
      vistoriadorNome: null,
      status: "rascunho",
    })
    .returning({ id: vistorias.id });

  revalidatePath(`/empreendimentos/${unidade.empreendimentoId}/unidades/${unidadeId}`);
  revalidatePath("/empreendimentos");
  invalidateVistorias();

  redirect(
    `/empreendimentos/${unidade.empreendimentoId}/unidades/${unidadeId}/vistorias/${created.id}`,
  );
}
