"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achadoEventos, achados, fotos, vistorias, categoriaEnum } from "@/db/schema";
import { requireSession } from "@/lib/auth";
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
  await requireSession();
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
  await requireSession();
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

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
        unidadeId: ctx.unidadeId,
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

  revalidatePath(vistoriaPath(ctx));
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
  const ctx = await vistoriaContext(vistoriaId);
  assertEditable(ctx);

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

  revalidatePath(vistoriaPath(ctx));
  return {};
}

export async function deleteAchadoAction(
  achadoId: string,
  vistoriaId: string,
): Promise<void> {
  await requireSession();
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

export async function finalizeVistoriaAction(
  vistoriaId: string,
): Promise<void> {
  await requireSession();
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
  await requireSession();
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
  await requireSession();
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
  await requireSession();
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

