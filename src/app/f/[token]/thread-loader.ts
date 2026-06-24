"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  funcionarios,
  mensagens,
  unidades,
  type Categoria,
} from "@/db/schema";
import {
  actionData,
  actionError,
  type DataActionResult,
} from "@/lib/action-result";

export type ThreadMessage = {
  id: string;
  autor: "funcionario" | "engenharia";
  texto: string;
  criadoEm: string;
  lidoEm: string | null;
  achadoRef: {
    id: string;
    local: string | null;
    descricao: string;
    categoria: Categoria;
    empreendimentoId: string;
    empreendimentoNome: string;
    unidadeId: string;
    unidadeNome: string;
  } | null;
};

export async function fetchThreadByTokenAction(
  token: string,
): Promise<DataActionResult<ThreadMessage[]>> {
  const [func] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .where(
      and(eq(funcionarios.token, token), isNull(funcionarios.desativadoEm)),
    )
    .limit(1);

  if (!func) {
    return actionError("Link inválido ou desativado.");
  }

  const rows = await db
    .select({
      id: mensagens.id,
      autor: mensagens.autor,
      texto: mensagens.texto,
      criadoEm: mensagens.criadoEm,
      lidoEm: mensagens.lidoEm,
      achadoId: achados.id,
      achadoLocal: achados.local,
      achadoDescricao: achados.descricao,
      achadoCategoria: achados.categoria,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
    })
    .from(mensagens)
    .leftJoin(achados, eq(achados.id, mensagens.achadoId))
    .leftJoin(unidades, eq(unidades.id, achados.unidadeId))
    .leftJoin(
      empreendimentos,
      eq(empreendimentos.id, unidades.empreendimentoId),
    )
    .where(eq(mensagens.funcionarioId, func.id))
    .orderBy(asc(mensagens.criadoEm));

  const data: ThreadMessage[] = rows.map((r) => ({
    id: r.id,
    autor: r.autor,
    texto: r.texto,
    criadoEm: r.criadoEm.toISOString(),
    lidoEm: r.lidoEm ? r.lidoEm.toISOString() : null,
    achadoRef:
      r.achadoId && r.unidadeId && r.empreendimentoId
        ? {
            id: r.achadoId,
            local: r.achadoLocal,
            descricao: r.achadoDescricao ?? "",
            categoria: (r.achadoCategoria ?? "ELE") as Categoria,
            empreendimentoId: r.empreendimentoId,
            empreendimentoNome: r.empreendimentoNome ?? "",
            unidadeId: r.unidadeId,
            unidadeNome: r.unidadeNome ?? "",
          }
        : null,
  }));

  return actionData(data);
}
