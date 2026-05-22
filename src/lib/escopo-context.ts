import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { escopos } from "@/db/schema";

export type EscopoCtx = {
  escopoId: string;
  empreendimentoId: string;
};

/**
 * Resolve o contexto de um escopo — qual empreendimento ele pertence. Usado
 * em todas as actions pra enforçar que mutacoes (adicionar/remover achado,
 * renomear, excluir) sao no escopo informado E que achados adicionados sao
 * de unidades do MESMO empreendimento. Sem essa amarra, um id forjado de
 * outro empreendimento passaria livre.
 */
export async function escopoContext(escopoId: string): Promise<EscopoCtx> {
  const [row] = await db
    .select({
      escopoId: escopos.id,
      empreendimentoId: escopos.empreendimentoId,
    })
    .from(escopos)
    .where(eq(escopos.id, escopoId))
    .limit(1);

  if (!row) throw new Error("Escopo não encontrado.");
  return row;
}

export function escopoPath(ctx: EscopoCtx): string {
  return `/empreendimentos/${ctx.empreendimentoId}/escopos/${ctx.escopoId}`;
}

export function escoposPath(empreendimentoId: string): string {
  return `/empreendimentos/${empreendimentoId}/escopos`;
}
