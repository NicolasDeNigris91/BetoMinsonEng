import "server-only";
import { unstable_cache } from "next/cache";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  fotos,
  unidades,
  vistorias,
  type Categoria,
  type EventoTipo,
} from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

export type AchadoSemPrazo = {
  id: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  empreendimentoNome: string;
  unidadeNome: string;
};

/**
 * Atividade carrega timestamps como string ISO em vez de Date — quando o
 * resultado passa por unstable_cache, JSON.stringify converte Date pra
 * string mas a leitura nao reverte automaticamente, e qualquer .getTime()
 * no consumidor quebra com "a.getTime is not a function". Padronizar pra
 * string evita a confusao; o consumidor faz parseISO se precisar de Date.
 */
export type DashboardActivity =
  | {
      kind: "evento";
      tipo: EventoTipo;
      at: string;
      categoria: Categoria;
      local: string | null;
      empreendimentoId: string;
      empreendimentoNome: string;
      unidadeId: string;
      unidadeNome: string;
      diasAteResolver: number | null;
      fotosCount: number;
    }
  | {
      kind: "vistoria-criada";
      at: string;
      empreendimentoId: string;
      empreendimentoNome: string;
      unidadeId: string;
      unidadeNome: string;
      vistoriaId: string;
      vistoriaData: string;
      vistoriadorNome: string | null;
    }
  | {
      kind: "vistoria-finalizada";
      at: string;
      empreendimentoId: string;
      empreendimentoNome: string;
      unidadeId: string;
      unidadeNome: string;
      vistoriaId: string;
      vistoriaData: string;
    };

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const ATIVIDADE_LIMIT = 10;

async function fetchDashboardData(seteDiasAtrasISO: string) {
  // Janelas pra comparativos:
  //   - "ultimos 7d": [seteDiasAtras, agora]
  //   - "7d anteriores": [quatorzeDiasAtras, seteDiasAtras]
  const agora = new Date();
  const seteDiasAtras = new Date(agora.getTime() - SETE_DIAS_MS);
  const quatorzeDiasAtras = new Date(seteDiasAtras.getTime() - SETE_DIAS_MS);
  const hojeISO = agora.toISOString().slice(0, 10);

  // Janela "semana atual" pra agenda — segunda a domingo (BR).
  // getDay(): 0=dom, 1=seg, ..., 6=sab
  const diaSemana = agora.getDay();
  const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
  const inicioSemana = new Date(agora);
  inicioSemana.setHours(0, 0, 0, 0);
  inicioSemana.setDate(agora.getDate() - diasDesdeSegunda);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 7);
  const inicioSemanaISO = inicioSemana.toISOString().slice(0, 10);
  const fimSemanaISO = fimSemana.toISOString().slice(0, 10);

  const [
    [achadosAbertosTotal],
    [vistoriasSemana],
    [vistoriasSemanaAnterior],
    [empreendimentosCount],
    [unidadesCount],
    [criadosUlt7d],
    [resolvidosUlt7d],
    [rascunhosTotal],
    [atrasadosTotal],
    proximasPendencias,
    [achadosSemPrazoRow],
    achadosSemPrazo,
    atividade,
    vistoriasDaSemanaRows,
    [proximaVistoriaRow],
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(achados)
      .where(eq(achados.status, "aberto")),
    db
      .select({ n: count() })
      .from(vistorias)
      .where(gte(vistorias.data, seteDiasAtrasISO)),
    db
      .select({ n: count() })
      .from(vistorias)
      .where(
        and(
          gte(vistorias.data, quatorzeDiasAtras.toISOString().slice(0, 10)),
          lt(vistorias.data, seteDiasAtrasISO),
        ),
      ),
    db.select({ n: count() }).from(empreendimentos),
    db.select({ n: count() }).from(unidades),
    db
      .select({ n: count() })
      .from(achadoEventos)
      .where(
        and(
          eq(achadoEventos.tipo, "criado"),
          gte(achadoEventos.createdAt, seteDiasAtras),
        ),
      ),
    db
      .select({ n: count() })
      .from(achadoEventos)
      .where(
        and(
          eq(achadoEventos.tipo, "resolvido"),
          gte(achadoEventos.createdAt, seteDiasAtras),
        ),
      ),
    db
      .select({ n: count() })
      .from(vistorias)
      .where(eq(vistorias.status, "rascunho")),
    // Atrasados = aberto com prazo < hoje. Comparacao por data (string ISO).
    db
      .select({ n: count() })
      .from(achados)
      .where(
        and(
          eq(achados.status, "aberto"),
          isNotNull(achados.prazoEm),
          lt(achados.prazoEm, hojeISO),
        ),
      ),
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
    // Achados em aberto SEM prazo definido — alimenta o banner e modal de
    // "definir prazos em lote".
    db
      .select({ n: count() })
      .from(achados)
      .where(
        and(
          eq(achados.status, "aberto"),
          sql`${achados.prazoEm} IS NULL`,
        ),
      ),
    // Lista detalhada dos sem prazo — limitada pro modal nao virar uma
    // tela infinita; suficiente pros casos comuns.
    db
      .select({
        id: achados.id,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        empreendimentoNome: empreendimentos.nome,
        unidadeNome: unidades.nome,
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(
        and(
          eq(achados.status, "aberto"),
          sql`${achados.prazoEm} IS NULL`,
        ),
      )
      .orderBy(asc(empreendimentos.nome), asc(unidades.nome), asc(achados.createdAt))
      .limit(50),
    fetchAtividadeRecente(),
    // Vistorias da semana atual (segunda-domingo) — alimenta a agenda compacta.
    db
      .select({ dataISO: vistorias.data, n: count() })
      .from(vistorias)
      .where(
        and(
          gte(vistorias.data, inicioSemanaISO),
          lt(vistorias.data, fimSemanaISO),
        ),
      )
      .groupBy(vistorias.data),
    // Proxima vistoria agendada (data futura e ainda rascunho) — usada na
    // "proxima acao sugerida" quando nao tem nada mais urgente.
    db
      .select({
        dataISO: vistorias.data,
        empreendimentoNome: empreendimentos.nome,
        unidadeNome: unidades.nome,
      })
      .from(vistorias)
      .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(
        and(
          eq(vistorias.status, "rascunho"),
          gte(vistorias.data, hojeISO),
        ),
      )
      .orderBy(asc(vistorias.data))
      .limit(1),
  ]);

  const totalAbertos = Number(achadosAbertosTotal?.n ?? 0);
  const totalAtrasados = Number(atrasadosTotal?.n ?? 0);
  const totalRascunhos = Number(rascunhosTotal?.n ?? 0);
  const totalVistoriasSemana = Number(vistoriasSemana?.n ?? 0);
  const totalVistoriasSemanaAnterior = Number(
    vistoriasSemanaAnterior?.n ?? 0,
  );
  const totalCriados7d = Number(criadosUlt7d?.n ?? 0);
  const totalResolvidos7d = Number(resolvidosUlt7d?.n ?? 0);

  // Delta "em aberto" = quanto o estoque variou nos ultimos 7d.
  // Positivo: piorou (mais criados que resolvidos). Negativo: melhorou.
  const deltaAbertos = totalCriados7d - totalResolvidos7d;
  const deltaVistorias = totalVistoriasSemana - totalVistoriasSemanaAnterior;

  // Constroi mapa dataISO -> count pra agenda. Cada dia da semana atual
  // aparece sempre (mesmo zerado), na ordem segunda → domingo.
  const semanaCount = new Map<string, number>();
  for (const r of vistoriasDaSemanaRows) {
    semanaCount.set(r.dataISO, Number(r.n));
  }
  const semana: { dataISO: string; n: number; isHoje: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    const iso = dia.toISOString().slice(0, 10);
    semana.push({
      dataISO: iso,
      n: semanaCount.get(iso) ?? 0,
      isHoje: iso === hojeISO,
    });
  }

  const proximaVistoria = proximaVistoriaRow
    ? {
        dataISO: proximaVistoriaRow.dataISO,
        empreendimentoNome: proximaVistoriaRow.empreendimentoNome,
        unidadeNome: proximaVistoriaRow.unidadeNome,
      }
    : null;

  return {
    totalAbertos,
    totalAtrasados,
    totalRascunhos,
    totalVistoriasSemana,
    totalEmp: Number(empreendimentosCount?.n ?? 0),
    totalUnid: Number(unidadesCount?.n ?? 0),
    totalSemPrazo: Number(achadosSemPrazoRow?.n ?? 0),
    deltaAbertos,
    deltaVistorias,
    proximasPendencias,
    achadosSemPrazo,
    atividade,
    semana,
    proximaVistoria,
  };
}

/**
 * Junta os ultimos eventos do app pra alimentar o feed "Atividade recente":
 *   - achado_eventos (criado, resolvido, persiste, nota)
 *   - vistorias criadas (qualquer status)
 *   - vistorias finalizadas (finalizadaEm preenchido)
 *
 * Cada origem retorna no maximo ATIVIDADE_LIMIT itens, depois sao
 * intercalados em memoria por data desc e cortados pro total final.
 */
async function fetchAtividadeRecente(): Promise<DashboardActivity[]> {
  const [eventos, vistoriasCriadas, vistoriasFinalizadas, fotosCounts] =
    await Promise.all([
      db
        .select({
          id: achadoEventos.id,
          tipo: achadoEventos.tipo,
          createdAt: achadoEventos.createdAt,
          achadoCreatedAt: achados.createdAt,
          categoria: achados.categoria,
          local: achados.local,
          empreendimentoId: empreendimentos.id,
          empreendimentoNome: empreendimentos.nome,
          unidadeId: unidades.id,
          unidadeNome: unidades.nome,
        })
        .from(achadoEventos)
        .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
        .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
        .innerJoin(
          empreendimentos,
          eq(empreendimentos.id, unidades.empreendimentoId),
        )
        .orderBy(desc(achadoEventos.createdAt))
        .limit(ATIVIDADE_LIMIT),
      db
        .select({
          id: vistorias.id,
          createdAt: vistorias.createdAt,
          data: vistorias.data,
          vistoriadorNome: vistorias.vistoriadorNome,
          empreendimentoId: empreendimentos.id,
          empreendimentoNome: empreendimentos.nome,
          unidadeId: unidades.id,
          unidadeNome: unidades.nome,
        })
        .from(vistorias)
        .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
        .innerJoin(
          empreendimentos,
          eq(empreendimentos.id, unidades.empreendimentoId),
        )
        .orderBy(desc(vistorias.createdAt))
        .limit(ATIVIDADE_LIMIT),
      db
        .select({
          id: vistorias.id,
          finalizadaEm: vistorias.finalizadaEm,
          data: vistorias.data,
          empreendimentoId: empreendimentos.id,
          empreendimentoNome: empreendimentos.nome,
          unidadeId: unidades.id,
          unidadeNome: unidades.nome,
        })
        .from(vistorias)
        .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
        .innerJoin(
          empreendimentos,
          eq(empreendimentos.id, unidades.empreendimentoId),
        )
        .where(isNotNull(vistorias.finalizadaEm))
        .orderBy(desc(vistorias.finalizadaEm))
        .limit(ATIVIDADE_LIMIT),
      // Contagem de fotos por evento — usado pra mostrar "3 fotos adicionadas"
      // junto do evento criado quando aplicavel. Limita pros mesmos eventos
      // recentes pra nao varrer a tabela inteira.
      db
        .select({
          eventoId: fotos.achadoEventoId,
          n: count(),
        })
        .from(fotos)
        .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
        .where(
          gte(
            achadoEventos.createdAt,
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          ),
        )
        .groupBy(fotos.achadoEventoId),
    ]);

  const fotosByEvento = new Map(
    fotosCounts.map((f) => [f.eventoId, Number(f.n)]),
  );

  const items: DashboardActivity[] = [];

  for (const ev of eventos) {
    const dias =
      ev.tipo === "resolvido"
        ? Math.max(
            0,
            Math.floor(
              (ev.createdAt.getTime() - ev.achadoCreatedAt.getTime()) /
                (24 * 60 * 60 * 1000),
            ),
          )
        : null;
    items.push({
      kind: "evento",
      tipo: ev.tipo,
      at: ev.createdAt.toISOString(),
      categoria: ev.categoria,
      local: ev.local,
      empreendimentoId: ev.empreendimentoId,
      empreendimentoNome: ev.empreendimentoNome,
      unidadeId: ev.unidadeId,
      unidadeNome: ev.unidadeNome,
      diasAteResolver: dias,
      fotosCount: fotosByEvento.get(ev.id) ?? 0,
    });
  }

  for (const v of vistoriasCriadas) {
    items.push({
      kind: "vistoria-criada",
      at: v.createdAt.toISOString(),
      empreendimentoId: v.empreendimentoId,
      empreendimentoNome: v.empreendimentoNome,
      unidadeId: v.unidadeId,
      unidadeNome: v.unidadeNome,
      vistoriaId: v.id,
      vistoriaData: v.data,
      vistoriadorNome: v.vistoriadorNome,
    });
  }

  for (const v of vistoriasFinalizadas) {
    if (!v.finalizadaEm) continue;
    items.push({
      kind: "vistoria-finalizada",
      at: v.finalizadaEm.toISOString(),
      empreendimentoId: v.empreendimentoId,
      empreendimentoNome: v.empreendimentoNome,
      unidadeId: v.unidadeId,
      unidadeNome: v.unidadeNome,
      vistoriaId: v.id,
      vistoriaData: v.data,
    });
  }

  // Comparacao de string ISO funciona porque o formato e lexicograficamente
  // ordenavel — equivalente a comparar por Date.
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, ATIVIDADE_LIMIT);
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
