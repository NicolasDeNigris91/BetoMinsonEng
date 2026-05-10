"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  unidades,
  vistorias,
  categoriaEnum,
} from "@/db/schema";
import { requireSession } from "@/lib/auth";

const novoAchadoSchema = z.object({
  categoria: z.enum(categoriaEnum.enumValues),
  local: z.string().trim().max(300).optional().or(z.literal("")),
  descricao: z.string().trim().min(1, "Descrição é obrigatória"),
});

export type NovoAchadoState = {
  fieldErrors?: Record<string, string>;
  error?: string;
};

async function getVistoriaContext(vistoriaId: string) {
  const [v] = await db
    .select({
      id: vistorias.id,
      status: vistorias.status,
      unidadeId: vistorias.unidadeId,
    })
    .from(vistorias)
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);

  if (!v) throw new Error("Vistoria não encontrada.");

  const [u] = await db
    .select({ empreendimentoId: unidades.empreendimentoId })
    .from(unidades)
    .where(eq(unidades.id, v.unidadeId))
    .limit(1);

  if (!u) throw new Error("Unidade não encontrada.");

  return {
    vistoria: v,
    empreendimentoId: u.empreendimentoId,
    pathBase: `/empreendimentos/${u.empreendimentoId}/unidades/${v.unidadeId}/vistorias/${v.id}`,
  };
}

function assertEditable(status: "rascunho" | "finalizada") {
  if (status !== "rascunho") {
    throw new Error("Vistoria já finalizada. Reabra antes de editar.");
  }
}

export async function setAchadoStateInVistoriaAction(
  vistoriaId: string,
  achadoId: string,
  state: "none" | "persiste" | "resolvido" | "nota",
): Promise<void> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);
  assertEditable(ctx.vistoria.status);

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

  revalidatePath(ctx.pathBase);
}

export async function createAchadoAction(
  vistoriaId: string,
  _prev: NovoAchadoState,
  formData: FormData,
): Promise<NovoAchadoState> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);
  assertEditable(ctx.vistoria.status);

  const parsed = novoAchadoSchema.safeParse({
    categoria: formData.get("categoria"),
    local: formData.get("local"),
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

  await db.transaction(async (tx) => {
    const [achado] = await tx
      .insert(achados)
      .values({
        unidadeId: ctx.vistoria.unidadeId,
        categoria: parsed.data.categoria,
        local: parsed.data.local || null,
        descricao: parsed.data.descricao,
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

  revalidatePath(ctx.pathBase);
  return {};
}

const updateAchadoSchema = z.object({
  categoria: z.enum(categoriaEnum.enumValues),
  local: z.string().trim().max(300).optional().or(z.literal("")),
  descricao: z.string().trim().min(1, "Descrição é obrigatória"),
});

export async function updateAchadoAction(
  achadoId: string,
  vistoriaId: string,
  _prev: NovoAchadoState,
  formData: FormData,
): Promise<NovoAchadoState> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);
  assertEditable(ctx.vistoria.status);

  const parsed = updateAchadoSchema.safeParse({
    categoria: formData.get("categoria"),
    local: formData.get("local"),
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
    .update(achados)
    .set({
      categoria: parsed.data.categoria,
      local: parsed.data.local || null,
      descricao: parsed.data.descricao,
    })
    .where(eq(achados.id, achadoId));

  revalidatePath(ctx.pathBase);
  return {};
}

export async function deleteAchadoAction(
  achadoId: string,
  vistoriaId: string,
): Promise<void> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);
  assertEditable(ctx.vistoria.status);

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

  await db.delete(achados).where(eq(achados.id, achadoId));
  revalidatePath(ctx.pathBase);
}

export async function finalizeVistoriaAction(
  vistoriaId: string,
): Promise<void> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);

  await db
    .update(vistorias)
    .set({
      status: "finalizada",
      finalizadaEm: new Date(),
    })
    .where(eq(vistorias.id, vistoriaId));

  revalidatePath(ctx.pathBase);
  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.vistoria.unidadeId}`,
  );
}

export async function reopenVistoriaAction(
  vistoriaId: string,
): Promise<void> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);

  await db
    .update(vistorias)
    .set({
      status: "rascunho",
      finalizadaEm: null,
    })
    .where(eq(vistorias.id, vistoriaId));

  revalidatePath(ctx.pathBase);
  revalidatePath(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.vistoria.unidadeId}`,
  );
}

const observacoesSchema = z.object({
  observacoesGerais: z.string().trim().optional().or(z.literal("")),
});

export async function updateObservacoesAction(
  vistoriaId: string,
  formData: FormData,
): Promise<void> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);
  assertEditable(ctx.vistoria.status);

  const parsed = observacoesSchema.safeParse({
    observacoesGerais: formData.get("observacoesGerais"),
  });
  if (!parsed.success) return;

  await db
    .update(vistorias)
    .set({ observacoesGerais: parsed.data.observacoesGerais || null })
    .where(eq(vistorias.id, vistoriaId));

  revalidatePath(ctx.pathBase);
}

export async function deleteVistoriaFromEditPageAction(
  vistoriaId: string,
): Promise<void> {
  await requireSession();
  const ctx = await getVistoriaContext(vistoriaId);

  if (ctx.vistoria.status === "finalizada") {
    throw new Error("Vistoria finalizada. Reabra antes de excluir.");
  }

  await db.delete(vistorias).where(eq(vistorias.id, vistoriaId));
  redirect(
    `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.vistoria.unidadeId}`,
  );
}

