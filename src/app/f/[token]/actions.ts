"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  funcionarioAchados,
  funcionarios,
  unidades,
} from "@/db/schema";
import {
  actionError,
  type VoidActionResult,
} from "@/lib/action-result";
import { applyAchadoStateInVistoria } from "@/lib/achado-state";
import { invalidateAchados, invalidateVistorias } from "@/lib/cache-tags";
import { FUNCIONARIOS_PATH, funcionarioPath } from "@/lib/funcionario-context";

type FuncionarioFromToken = {
  funcionarioId: string;
  nome: string;
};

async function loadFuncionarioFromToken(
  token: string,
): Promise<FuncionarioFromToken | null> {
  const [row] = await db
    .select({
      funcionarioId: funcionarios.id,
      nome: funcionarios.nome,
    })
    .from(funcionarios)
    .where(
      and(eq(funcionarios.token, token), isNull(funcionarios.desativadoEm)),
    )
    .limit(1);

  return row ?? null;
}

type AchadoCtx = {
  achadoId: string;
  unidadeId: string;
  vistoriaOrigemId: string;
  empreendimentoId: string;
};

async function loadAchadoDoFuncionario(
  funcionarioId: string,
  achadoId: string,
): Promise<AchadoCtx | null> {
  const [row] = await db
    .select({
      achadoId: achados.id,
      unidadeId: achados.unidadeId,
      vistoriaOrigemId: achados.vistoriaOrigemId,
      empreendimentoId: unidades.empreendimentoId,
    })
    .from(funcionarioAchados)
    .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(
      and(
        eq(funcionarioAchados.funcionarioId, funcionarioId),
        eq(funcionarioAchados.achadoId, achadoId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function unidadePath(empreendimentoId: string, unidadeId: string): string {
  return `/empreendimentos/${empreendimentoId}/unidades/${unidadeId}`;
}

export async function setAchadoStateViaFuncionarioAction(
  token: string,
  achadoId: string,
  state: "resolvido" | "persiste",
  notaExtra?: string,
): Promise<VoidActionResult> {
  if (state !== "resolvido" && state !== "persiste") {
    return actionError("Estado inválido.");
  }

  const ctx = await loadFuncionarioFromToken(token);
  if (!ctx) {
    return actionError("Link inválido ou desativado.");
  }

  const achadoCtx = await loadAchadoDoFuncionario(ctx.funcionarioId, achadoId);
  if (!achadoCtx) {
    return actionError("Achado não pertence a este funcionário.");
  }

  const trimmedNota = notaExtra?.trim();

  await db.transaction(async (tx) => {
    const { eventoId } = await applyAchadoStateInVistoria(tx, {
      vistoriaId: achadoCtx.vistoriaOrigemId,
      achadoId,
      state,
      expectedUnidadeId: achadoCtx.unidadeId,
      funcionarioOrigemId: ctx.funcionarioId,
    });

    if (eventoId && trimmedNota !== undefined) {
      await tx
        .update(achadoEventos)
        .set({ notaExtra: trimmedNota.length > 0 ? trimmedNota : null })
        .where(eq(achadoEventos.id, eventoId));
    }
  });

  revalidatePath(`/f/${token}`);
  revalidatePath(funcionarioPath(ctx.funcionarioId));
  revalidatePath(FUNCIONARIOS_PATH);
  revalidatePath(unidadePath(achadoCtx.empreendimentoId, achadoCtx.unidadeId));
  invalidateAchados();
  invalidateVistorias();
}

export async function updateNotaViaFuncionarioAction(
  token: string,
  achadoId: string,
  notaExtra: string,
): Promise<VoidActionResult> {
  const ctx = await loadFuncionarioFromToken(token);
  if (!ctx) {
    return actionError("Link inválido ou desativado.");
  }

  const achadoCtx = await loadAchadoDoFuncionario(ctx.funcionarioId, achadoId);
  if (!achadoCtx) {
    return actionError("Achado não pertence a este funcionário.");
  }

  const trimmed = notaExtra.trim();

  await db
    .update(achadoEventos)
    .set({ notaExtra: trimmed.length > 0 ? trimmed : null })
    .where(
      and(
        eq(achadoEventos.achadoId, achadoId),
        eq(achadoEventos.vistoriaId, achadoCtx.vistoriaOrigemId),
        eq(achadoEventos.funcionarioOrigemId, ctx.funcionarioId),
      ),
    );

  revalidatePath(`/f/${token}`);
  revalidatePath(unidadePath(achadoCtx.empreendimentoId, achadoCtx.unidadeId));
}
