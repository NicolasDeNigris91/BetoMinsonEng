"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  funcionarioAchados,
  mensagens,
  unidades,
  type Categoria,
} from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { funcionarioContext } from "@/lib/funcionario-context";
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

export async function fetchThreadAction(
  funcionarioId: string,
): Promise<DataActionResult<ThreadMessage[]>> {
  await requireSession();
  try {
    await funcionarioContext(funcionarioId);
  } catch {
    return actionError("Funcionário não encontrado.");
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
    .where(eq(mensagens.funcionarioId, funcionarioId))
    .orderBy(asc(mensagens.criadoEm));

  const data: ThreadMessage[] = rows.map((r) => ({
    id: r.id,
    autor: r.autor,
    texto: r.texto,
    criadoEm: r.criadoEm.toISOString(),
    lidoEm: r.lidoEm ? r.lidoEm.toISOString() : null,
    achadoRef:
      r.achadoId &&
      r.unidadeId &&
      r.empreendimentoId
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

export type AchadoOption = {
  id: string;
  local: string | null;
  descricao: string;
  categoria: Categoria;
  status: "aberto" | "persiste" | "resolvido";
  empreendimentoId: string;
  empreendimentoNome: string;
  unidadeId: string;
  unidadeNome: string;
};

export async function fetchAchadosDoFuncionarioAction(
  funcionarioId: string,
): Promise<DataActionResult<AchadoOption[]>> {
  await requireSession();
  try {
    await funcionarioContext(funcionarioId);
  } catch {
    return actionError("Funcionário não encontrado.");
  }

  const rows = await db
    .select({
      id: achados.id,
      local: achados.local,
      descricao: achados.descricao,
      categoria: achados.categoria,
      status: achados.status,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
    })
    .from(funcionarioAchados)
    .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .innerJoin(empreendimentos, eq(empreendimentos.id, unidades.empreendimentoId))
    .where(
      and(
        eq(funcionarioAchados.funcionarioId, funcionarioId),
        ne(achados.status, "resolvido"),
      ),
    )
    .orderBy(asc(empreendimentos.nome), asc(unidades.nome));

  return actionData(rows);
}
