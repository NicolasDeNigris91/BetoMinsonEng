import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  unidades,
  vistorias,
  type Categoria,
} from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Carrega os agregados que alimentam a home (dashboard). Cacheado com
 * unstable_cache: re-roda apenas quando alguma das tags relevantes
 * (achados/vistorias/empreendimentos/unidades) e invalidada por uma
 * mutacao.
 *
 * O parametro `seteDiasAtrasISO` precisa entrar como key do cache pra
 * que a janela de 7 dias avance com o tempo — caso contrario, no proximo
 * dia o cache ainda apontaria pra janela antiga.
 */
async function fetchDashboardData(seteDiasAtrasISO: string) {
  const [
    [achadosAbertosTotal],
    [vistoriasSemana],
    [empreendimentosCount],
    [unidadesCount],
    proximasPendencias,
    tempoMedioPorCategoria,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(achados)
      .where(eq(achados.status, "aberto")),
    db
      .select({ n: count() })
      .from(vistorias)
      .where(gte(vistorias.data, seteDiasAtrasISO)),
    db.select({ n: count() }).from(empreendimentos),
    db.select({ n: count() }).from(unidades),
    db
      .select({
        id: achados.id,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        prazoEm: achados.prazoEm,
        empreendimentoId: empreendimentos.id,
        empreendimentoNome: empreendimentos.nome,
        unidadeId: unidades.id,
        unidadeNome: unidades.nome,
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(and(eq(achados.status, "aberto"), isNotNull(achados.prazoEm)))
      .orderBy(asc(achados.prazoEm))
      .limit(6),
    db
      .select({
        categoria: achados.categoria,
        diasAvg: sql<number>`avg(extract(epoch from (${achadoEventos.createdAt} - ${achados.createdAt})) / 86400)`,
        n: count(),
      })
      .from(achados)
      .innerJoin(
        achadoEventos,
        and(
          eq(achadoEventos.achadoId, achados.id),
          eq(achadoEventos.tipo, "resolvido"),
        ),
      )
      .where(eq(achados.status, "resolvido"))
      .groupBy(achados.categoria)
      .orderBy(desc(sql`count(*)`)),
  ]);

  return {
    totalAbertos: Number(achadosAbertosTotal?.n ?? 0),
    totalVistoriasSemana: Number(vistoriasSemana?.n ?? 0),
    totalEmp: Number(empreendimentosCount?.n ?? 0),
    totalUnid: Number(unidadesCount?.n ?? 0),
    proximasPendencias,
    tempoMedioPorCategoria: tempoMedioPorCategoria.map((row) => ({
      categoria: row.categoria as Categoria,
      diasAvg: Number(row.diasAvg ?? 0),
      n: Number(row.n),
    })),
  };
}

export const getDashboardData = unstable_cache(
  fetchDashboardData,
  ["dashboard-data"],
  {
    tags: [
      CACHE_TAGS.achados,
      CACHE_TAGS.vistorias,
      CACHE_TAGS.empreendimentos,
      CACHE_TAGS.unidades,
    ],
    // revalidate=false significa que so invalidamos via revalidateTag.
    // Sem isso, Next aplicaria um TTL implicito.
    revalidate: false,
  },
);
