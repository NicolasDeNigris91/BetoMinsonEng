"use server";

import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  unidades,
  type Categoria,
} from "@/db/schema";
import { requireSession } from "@/lib/auth";

const PER_TIPO_LIMIT = 8;

export type SearchResult =
  | {
      tipo: "empreendimento";
      id: string;
      nome: string;
      cliente: string | null;
      href: string;
    }
  | {
      tipo: "unidade";
      id: string;
      nome: string;
      empreendimentoNome: string;
      empreendimentoId: string;
      href: string;
    }
  | {
      tipo: "achado";
      id: string;
      categoria: Categoria;
      local: string | null;
      descricao: string;
      empreendimentoNome: string;
      unidadeNome: string;
      empreendimentoId: string;
      unidadeId: string;
      status: "aberto" | "resolvido";
      href: string;
    };

/**
 * Busca rapida global. ILIKE em 3 tabelas. Limita por tipo pra resposta
 * pequena. Vazio se query < 2 chars (evita match indiscriminado).
 */
export async function searchGlobalAction(query: string): Promise<SearchResult[]> {
  await requireSession();

  const q = query.trim();
  if (q.length < 2) return [];

  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  const [empRows, uniRows, achRows] = await Promise.all([
    db
      .select({
        id: empreendimentos.id,
        nome: empreendimentos.nome,
        cliente: empreendimentos.cliente,
      })
      .from(empreendimentos)
      .where(
        or(
          ilike(empreendimentos.nome, pattern),
          ilike(empreendimentos.cliente, pattern),
        ),
      )
      .orderBy(sql`length(${empreendimentos.nome})`)
      .limit(PER_TIPO_LIMIT),
    db
      .select({
        id: unidades.id,
        nome: unidades.nome,
        empreendimentoId: empreendimentos.id,
        empreendimentoNome: empreendimentos.nome,
      })
      .from(unidades)
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(ilike(unidades.nome, pattern))
      .orderBy(sql`length(${unidades.nome})`)
      .limit(PER_TIPO_LIMIT),
    db
      .select({
        id: achados.id,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        status: achados.status,
        unidadeId: unidades.id,
        unidadeNome: unidades.nome,
        empreendimentoId: empreendimentos.id,
        empreendimentoNome: empreendimentos.nome,
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(
        and(
          or(
            ilike(achados.descricao, pattern),
            ilike(achados.local, pattern),
          ),
        ),
      )
      .orderBy(sql`length(${achados.descricao})`)
      .limit(PER_TIPO_LIMIT),
  ]);

  const results: SearchResult[] = [];

  for (const e of empRows) {
    results.push({
      tipo: "empreendimento",
      id: e.id,
      nome: e.nome,
      cliente: e.cliente,
      href: `/empreendimentos/${e.id}`,
    });
  }
  for (const u of uniRows) {
    results.push({
      tipo: "unidade",
      id: u.id,
      nome: u.nome,
      empreendimentoId: u.empreendimentoId,
      empreendimentoNome: u.empreendimentoNome,
      href: `/empreendimentos/${u.empreendimentoId}/unidades/${u.id}`,
    });
  }
  for (const a of achRows) {
    results.push({
      tipo: "achado",
      id: a.id,
      categoria: a.categoria,
      local: a.local,
      descricao: a.descricao,
      status: a.status,
      unidadeId: a.unidadeId,
      unidadeNome: a.unidadeNome,
      empreendimentoId: a.empreendimentoId,
      empreendimentoNome: a.empreendimentoNome,
      href: `/empreendimentos/${a.empreendimentoId}/unidades/${a.unidadeId}`,
    });
  }

  return results;
}
