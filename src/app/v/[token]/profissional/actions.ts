"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  achadoComentarios,
  achadoEventos,
  achados,
  escopoAchados,
  escopoShareTokens,
  escopos,
  unidades,
} from "@/db/schema";
import {
  actionError,
  type VoidActionResult,
} from "@/lib/action-result";
import { applyAchadoStateInVistoria } from "@/lib/achado-state";
import { invalidateAchados, invalidateVistorias } from "@/lib/cache-tags";
import { escopoPath } from "@/lib/escopo-context";

/**
 * Server actions chamadas pela rota publica `/v/[token]/profissional`.
 * Auth e por token (escopoShareTokens, nao revogado) — sem session, sem
 * requireMutation. Cada action revalida tanto a rota publica quanto a
 * pagina admin do escopo + a unidade do achado.
 */

type EscopoFromToken = {
  tokenId: string;
  escopoId: string;
  empreendimentoId: string;
  nomeEscopo: string;
};

async function loadEscopoFromTokenForMutation(
  token: string,
): Promise<EscopoFromToken | null> {
  const [row] = await db
    .select({
      tokenId: escopoShareTokens.id,
      escopoId: escopos.id,
      empreendimentoId: escopos.empreendimentoId,
      nomeEscopo: escopos.nome,
    })
    .from(escopoShareTokens)
    .innerJoin(escopos, eq(escopos.id, escopoShareTokens.escopoId))
    .where(
      and(
        eq(escopoShareTokens.token, token),
        isNull(escopoShareTokens.revogadoEm),
      ),
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

/**
 * Carrega o achado garantindo que ele pertence ao escopo do token. A
 * vistoria onde o evento vai ser registrado e a vistoriaOrigemId — a
 * mesma onde o achado foi originalmente criado — pra UI da timeline
 * agrupar criacao + resolucao no mesmo card.
 */
async function loadAchadoInEscopo(
  escopoId: string,
  achadoId: string,
): Promise<AchadoCtx | null> {
  const [row] = await db
    .select({
      achadoId: achados.id,
      unidadeId: achados.unidadeId,
      vistoriaOrigemId: achados.vistoriaOrigemId,
      empreendimentoId: unidades.empreendimentoId,
    })
    .from(escopoAchados)
    .innerJoin(achados, eq(achados.id, escopoAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(
      and(
        eq(escopoAchados.escopoId, escopoId),
        eq(escopoAchados.achadoId, achadoId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function unidadePath(empreendimentoId: string, unidadeId: string): string {
  return `/empreendimentos/${empreendimentoId}/unidades/${unidadeId}`;
}

/**
 * Marca um achado como resolvido ou persiste via link publico do escopo.
 * O evento e gravado na vistoria onde o achado foi criado (vistoriaOrigemId),
 * com escopoOrigemId apontando pro escopo — assim aparece direto na
 * timeline da vistoria principal, com chip "via escopo: X" identificando
 * a procedencia.
 *
 * Permite state "resolvido" | "persiste". Sem "desfazer" (alinhado com a
 * decisao do produto).
 */
export async function setAchadoStateViaTokenAction(
  token: string,
  achadoId: string,
  state: "resolvido" | "persiste",
  notaExtra?: string,
): Promise<VoidActionResult> {
  if (state !== "resolvido" && state !== "persiste") {
    return actionError("Estado invalido.");
  }

  const escopoCtx = await loadEscopoFromTokenForMutation(token);
  if (!escopoCtx) {
    return actionError("Link invalido ou revogado.");
  }

  const achadoCtx = await loadAchadoInEscopo(escopoCtx.escopoId, achadoId);
  if (!achadoCtx) {
    return actionError("Achado nao pertence a este escopo.");
  }

  const trimmedNota = notaExtra?.trim();

  await db.transaction(async (tx) => {
    const { eventoId } = await applyAchadoStateInVistoria(tx, {
      vistoriaId: achadoCtx.vistoriaOrigemId,
      achadoId,
      state,
      expectedUnidadeId: achadoCtx.unidadeId,
      escopoOrigemId: escopoCtx.escopoId,
    });

    if (eventoId && trimmedNota !== undefined) {
      await tx
        .update(achadoEventos)
        .set({ notaExtra: trimmedNota.length > 0 ? trimmedNota : null })
        .where(eq(achadoEventos.id, eventoId));
    }
  });

  revalidatePath(`/v/${token}/profissional`);
  revalidatePath(
    escopoPath({
      escopoId: escopoCtx.escopoId,
      empreendimentoId: escopoCtx.empreendimentoId,
    }),
  );
  revalidatePath(unidadePath(achadoCtx.empreendimentoId, achadoCtx.unidadeId));
  invalidateAchados();
  invalidateVistorias();
}

/**
 * Atualiza a nota de um achado ja marcado (sem alterar tipo). Usado
 * quando o profissional ja marcou persiste e quer ajustar o texto.
 */
export async function updateNotaViaTokenAction(
  token: string,
  achadoId: string,
  notaExtra: string,
): Promise<VoidActionResult> {
  const escopoCtx = await loadEscopoFromTokenForMutation(token);
  if (!escopoCtx) {
    return actionError("Link invalido ou revogado.");
  }

  const achadoCtx = await loadAchadoInEscopo(escopoCtx.escopoId, achadoId);
  if (!achadoCtx) {
    return actionError("Achado nao pertence a este escopo.");
  }

  const trimmed = notaExtra.trim();

  await db
    .update(achadoEventos)
    .set({ notaExtra: trimmed.length > 0 ? trimmed : null })
    .where(
      and(
        eq(achadoEventos.achadoId, achadoId),
        eq(achadoEventos.vistoriaId, achadoCtx.vistoriaOrigemId),
        eq(achadoEventos.escopoOrigemId, escopoCtx.escopoId),
      ),
    );

  revalidatePath(`/v/${token}/profissional`);
  revalidatePath(unidadePath(achadoCtx.empreendimentoId, achadoCtx.unidadeId));
}

const comentarioSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "Mensagem vazia.")
    .max(2000, "Mensagem muito longa (máx. 2000 caracteres)."),
});

/**
 * Adiciona um comentario do profissional no thread (achadoId, escopoId).
 * Espelha addComentarioEngenheiroAction do lado admin — mesma tabela,
 * mesma chave logica, autor diferente.
 *
 * Auth: token de escopo nao revogado. Achado precisa estar no escopo.
 */
export async function addComentarioViaTokenAction(
  token: string,
  achadoId: string,
  texto: string,
): Promise<VoidActionResult> {
  const parsed = comentarioSchema.safeParse({ texto });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Comentário inválido.");
  }

  const escopoCtx = await loadEscopoFromTokenForMutation(token);
  if (!escopoCtx) {
    return actionError("Link invalido ou revogado.");
  }

  const achadoCtx = await loadAchadoInEscopo(escopoCtx.escopoId, achadoId);
  if (!achadoCtx) {
    return actionError("Achado nao pertence a este escopo.");
  }

  await db.insert(achadoComentarios).values({
    achadoId,
    escopoId: escopoCtx.escopoId,
    autor: "profissional",
    texto: parsed.data.texto,
  });

  revalidatePath(`/v/${token}/profissional`);
  revalidatePath(
    escopoPath({
      escopoId: escopoCtx.escopoId,
      empreendimentoId: escopoCtx.empreendimentoId,
    }),
  );
  revalidatePath(unidadePath(achadoCtx.empreendimentoId, achadoCtx.unidadeId));
  invalidateAchados();
}
