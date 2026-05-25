import "server-only";
import { unstable_cache } from "next/cache";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  escopoAchados,
  escopoShareTokens,
  escopos,
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
      /** Quando setado, evento veio do link publico do profissional. */
      escopoOrigemId: string | null;
      escopoOrigemNome: string | null;
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
    }
  | {
      kind: "ordem-concluida";
      at: string;
      empreendimentoId: string;
      empreendimentoNome: string;
      escopoId: string;
      escopoNome: string;
      totalAchados: number;
      nUnidades: number;
    };

export type OrdemEmAndamento = {
  escopoId: string;
  escopoNome: string;
  empreendimentoId: string;
  empreendimentoNome: string;
  nUnidades: number;
  total: number;
  resolvidos: number;
  persistencias: number;
  pendentes: number;
  ultimaAcaoAt: string | null;
  /** Status derivado de progresso + atividade. */
  status: "concluido" | "em_servico" | "aguardando";
};

export type PersistenciaPendente = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  empreendimentoId: string;
  empreendimentoNome: string;
  unidadeId: string;
  unidadeNome: string;
  notaExtra: string | null;
  escopoId: string;
  escopoNome: string;
  marcadoEm: string;
};

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
// 30 itens cobre os ultimos dias com folga; a UI exibe ~6 por vez com
// scroll interno e contador "X de Y". Acima disso e melhor um link pra
// /atividade dedicado, ainda nao implementado.
const ATIVIDADE_LIMIT = 30;

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
    atividadeTotal,
    vistoriasDaSemanaRows,
    [proximaVistoriaRow],
    [ordensAtivasRow],
    ordensEmAndamento,
    persistenciasPendentes,
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
    // Total de eventos passiveis de virar atividade (eventos + vistorias
    // criadas + finalizadas) — alimenta o contador "X de Y" sem reler tudo.
    fetchAtividadeTotal(),
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
    // Ordens ativas: escopos distintos com pelo menos 1 share_token nao
    // revogado. Profissionais = escopos distintos (cada escopo representa
    // um servico/pessoa).
    db
      .select({
        nOrdens: countDistinct(escopoShareTokens.escopoId),
      })
      .from(escopoShareTokens)
      .where(isNull(escopoShareTokens.revogadoEm)),
    // Lista de ordens em andamento. Agrega por escopo: total de achados,
    // resolvidos via escopo, persistencias via escopo, e ultima acao.
    // Limita aos escopos com link ativo (ordem viva).
    fetchOrdensEmAndamento(),
    // Persistencias que precisam de decisao: eventos do tipo 'persiste'
    // que vieram via escopo (escopoOrigemId != null). Vai pro banner +
    // futuro link /persistencias.
    fetchPersistenciasPendentes(),
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
    atividadeTotal,
    semana,
    proximaVistoria,
    totalOrdensAtivas: Number(ordensAtivasRow?.nOrdens ?? 0),
    ordensEmAndamento,
    persistenciasPendentes,
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
  const [eventos, vistoriasCriadas, vistoriasFinalizadas, fotosCounts, ordensConcluidas] =
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
          escopoOrigemId: escopos.id,
          escopoOrigemNome: escopos.nome,
        })
        .from(achadoEventos)
        .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
        .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
        .innerJoin(
          empreendimentos,
          eq(empreendimentos.id, unidades.empreendimentoId),
        )
        .leftJoin(escopos, eq(escopos.id, achadoEventos.escopoOrigemId))
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
      fetchOrdensConcluidasRecentes(),
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
      escopoOrigemId: ev.escopoOrigemId,
      escopoOrigemNome: ev.escopoOrigemNome,
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

  for (const o of ordensConcluidas) {
    items.push(o);
  }

  // Comparacao de string ISO funciona porque o formato e lexicograficamente
  // ordenavel — equivalente a comparar por Date.
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, ATIVIDADE_LIMIT);
}

/**
 * Eventos sinteticos "ordem-concluida" — sao derivados, nao tem tabela
 * propria. Quando todos os achados de um escopo estao resolvidos e pelo
 * menos um foi via escopo, geramos um item com timestamp = ultima acao
 * via escopo. Isso entra na atividade recente como "Ordem X concluida".
 *
 * Heuristica do "concluida em": maior createdAt entre eventos via escopo.
 * Nao e exato (so existiria com um campo concluido_em proprio), mas e
 * suficiente pro feed temporal.
 */
async function fetchOrdensConcluidasRecentes(): Promise<
  Extract<DashboardActivity, { kind: "ordem-concluida" }>[]
> {
  const rows = await db
    .select({
      escopoId: escopos.id,
      escopoNome: escopos.nome,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
      total: count(achados.id),
      resolvidos: sql<number>`count(*) filter (where ${achados.status} = 'resolvido')::int`,
      nUnidades: countDistinct(achados.unidadeId),
      // ultima acao via escopo (so eventos com escopoOrigemId = este
      // escopo). Cast pra string ISO no SQL pra evitar variacao de tipo
      // entre drivers (postgres-js retorna max(timestamp) como string,
      // sem .toISOString).
      ultimaAcaoAt: sql<string | null>`to_char(max(${achadoEventos.createdAt}) filter (where ${achadoEventos.escopoOrigemId} = ${escopos.id}), 'YYYY-MM-DD"T"HH24:MI:SS.MSOF')`,
      acoesViaEscopo: sql<number>`count(*) filter (where ${achadoEventos.escopoOrigemId} = ${escopos.id})::int`,
    })
    .from(escopos)
    .innerJoin(empreendimentos, eq(empreendimentos.id, escopos.empreendimentoId))
    .innerJoin(escopoAchados, eq(escopoAchados.escopoId, escopos.id))
    .innerJoin(achados, eq(achados.id, escopoAchados.achadoId))
    .leftJoin(
      achadoEventos,
      eq(achadoEventos.achadoId, achados.id),
    )
    .groupBy(
      escopos.id,
      escopos.nome,
      empreendimentos.id,
      empreendimentos.nome,
    );

  return rows
    .filter(
      (r) =>
        Number(r.total) > 0 &&
        Number(r.resolvidos) === Number(r.total) &&
        Number(r.acoesViaEscopo) > 0 &&
        r.ultimaAcaoAt,
    )
    .map((r) => ({
      kind: "ordem-concluida" as const,
      // ultimaAcaoAt ja vem como string ISO do to_char no SQL
      at: r.ultimaAcaoAt!,
      empreendimentoId: r.empreendimentoId,
      empreendimentoNome: r.empreendimentoNome,
      escopoId: r.escopoId,
      escopoNome: r.escopoNome,
      totalAchados: Number(r.total),
      nUnidades: Number(r.nUnidades),
    }));
}

/**
 * Total combinado de itens que a Atividade Recente potencialmente lista:
 *   - todos os achado_eventos
 *   - todas as vistorias criadas
 *   - todas as vistorias finalizadas
 *
 * Soma simples de COUNT — barato e da o denominador do "X de Y" no header
 * da Atividade. Pode passar do real (vistoria conta 2x se criada+finalizada
 * dentro da janela), mas como UX e so um indicativo aproximado, ok.
 */
async function fetchAtividadeTotal(): Promise<number> {
  const [[ev], [vc], [vf]] = await Promise.all([
    db.select({ n: count() }).from(achadoEventos),
    db.select({ n: count() }).from(vistorias),
    db
      .select({ n: count() })
      .from(vistorias)
      .where(isNotNull(vistorias.finalizadaEm)),
  ]);
  return Number(ev?.n ?? 0) + Number(vc?.n ?? 0) + Number(vf?.n ?? 0);
}

/**
 * Lista de ordens (escopos) em andamento — aquelas que ja foram entregues
 * a um profissional (tem token nao revogado). Agrega:
 *   - total de achados no escopo
 *   - resolvidos (status GLOBAL do achado — nao importa quem resolveu;
 *     se o achado esta pronto, conta pro progresso do escopo)
 *   - persistencias ATIVAS via escopo (profissional marcou persiste e o
 *     achado ainda nao foi resolvido por outra via)
 *   - timestamp da ultima acao via escopo (so do profissional)
 *
 * Por que resolvidos globais: o que importa pro gestor e se o achado da
 * ordem esta pronto ou nao. Se a engenharia ou outro escopo resolveu, o
 * profissional desse escopo nao precisa mais agir naquilo — entao conta.
 * Caso contrario, dois escopos compartilhando o mesmo achado mostrariam
 * "01/04" e "01/04" para a mesma ordem que ja esta concluida.
 *
 * Status derivado:
 *   - concluido: todos os achados estao resolvidos (independente de quem)
 *   - em_servico: profissional teve qualquer acao via link
 *   - aguardando: profissional ainda nao abriu / nao fez nada
 */
async function fetchOrdensEmAndamento(): Promise<OrdemEmAndamento[]> {
  // 1. Escopos com token ativo (a "ordem viva")
  const escoposAtivos = await db
    .selectDistinct({
      escopoId: escopos.id,
      escopoNome: escopos.nome,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
    })
    .from(escopoShareTokens)
    .innerJoin(escopos, eq(escopos.id, escopoShareTokens.escopoId))
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, escopos.empreendimentoId),
    )
    .where(isNull(escopoShareTokens.revogadoEm))
    .orderBy(asc(escopos.nome));

  if (escoposAtivos.length === 0) return [];

  const escopoIds = escoposAtivos.map((e) => e.escopoId);

  // 2. Agregado por escopo: total, resolvidos GLOBAIS (status do achado),
  //    unidades distintas.
  const totaisPorEscopo = await db
    .select({
      escopoId: escopoAchados.escopoId,
      total: count(achados.id),
      resolvidosGlobais: sql<number>`count(*) filter (where ${achados.status} = 'resolvido')::int`,
      nUnidades: countDistinct(achados.unidadeId),
    })
    .from(escopoAchados)
    .innerJoin(achados, eq(achados.id, escopoAchados.achadoId))
    .where(inArray(escopoAchados.escopoId, escopoIds))
    .groupBy(escopoAchados.escopoId);

  // 3. Atividade do profissional via escopo: persistencias ATIVAS (achado
  //    ainda aberto), quantidade de acoes e timestamp da ultima.
  const eventosPorEscopo = await db
    .select({
      escopoId: achadoEventos.escopoOrigemId,
      persistenciasAtivas: sql<number>`count(*) filter (where ${achadoEventos.tipo} = 'persiste' and ${achados.status} = 'aberto')::int`,
      acoes: count(achadoEventos.id),
      ultimaAcaoAt: max(achadoEventos.createdAt),
    })
    .from(achadoEventos)
    .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
    .where(inArray(achadoEventos.escopoOrigemId, escopoIds))
    .groupBy(achadoEventos.escopoOrigemId);

  const totalMap = new Map(
    totaisPorEscopo.map((t) => [
      t.escopoId,
      {
        total: Number(t.total),
        resolvidosGlobais: Number(t.resolvidosGlobais),
        nUnidades: Number(t.nUnidades),
      },
    ]),
  );
  const eventosMap = new Map(
    eventosPorEscopo
      .filter((e): e is typeof e & { escopoId: string } =>
        Boolean(e.escopoId),
      )
      .map((e) => [
        e.escopoId,
        {
          persistenciasAtivas: Number(e.persistenciasAtivas),
          acoes: Number(e.acoes),
          ultimaAcaoAt: e.ultimaAcaoAt,
        },
      ]),
  );

  return escoposAtivos.map((e) => {
    const t = totalMap.get(e.escopoId) ?? {
      total: 0,
      resolvidosGlobais: 0,
      nUnidades: 0,
    };
    const ev = eventosMap.get(e.escopoId) ?? {
      persistenciasAtivas: 0,
      acoes: 0,
      ultimaAcaoAt: null,
    };
    const pendentes = Math.max(
      0,
      t.total - t.resolvidosGlobais - ev.persistenciasAtivas,
    );
    const status: OrdemEmAndamento["status"] =
      t.total > 0 && t.resolvidosGlobais === t.total
        ? "concluido"
        : ev.acoes > 0
          ? "em_servico"
          : "aguardando";
    return {
      escopoId: e.escopoId,
      escopoNome: e.escopoNome,
      empreendimentoId: e.empreendimentoId,
      empreendimentoNome: e.empreendimentoNome,
      nUnidades: t.nUnidades,
      total: t.total,
      resolvidos: t.resolvidosGlobais,
      persistencias: ev.persistenciasAtivas,
      pendentes,
      ultimaAcaoAt: ev.ultimaAcaoAt ? ev.ultimaAcaoAt.toISOString() : null,
      status,
    };
  });
}

/**
 * Persistencias pendentes de decisao da engenharia. Filtra eventos do
 * tipo 'persiste' que vieram via escopo (escopo_origem_id setado), com o
 * achado ainda em aberto — assim que a engenharia resolve ou descarta,
 * sai da lista.
 */
async function fetchPersistenciasPendentes(): Promise<PersistenciaPendente[]> {
  const rows = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      notaExtra: achadoEventos.notaExtra,
      escopoId: escopos.id,
      escopoNome: escopos.nome,
      marcadoEm: achadoEventos.createdAt,
    })
    .from(achadoEventos)
    .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, unidades.empreendimentoId),
    )
    .innerJoin(escopos, eq(escopos.id, achadoEventos.escopoOrigemId))
    .where(
      and(
        eq(achadoEventos.tipo, "persiste"),
        isNotNull(achadoEventos.escopoOrigemId),
        eq(achados.status, "aberto"),
      ),
    )
    .orderBy(desc(achadoEventos.createdAt))
    .limit(20);

  return rows.map((r) => ({
    achadoId: r.achadoId,
    categoria: r.categoria,
    local: r.local,
    descricao: r.descricao,
    empreendimentoId: r.empreendimentoId,
    empreendimentoNome: r.empreendimentoNome,
    unidadeId: r.unidadeId,
    unidadeNome: r.unidadeNome,
    notaExtra: r.notaExtra,
    escopoId: r.escopoId,
    escopoNome: r.escopoNome,
    marcadoEm: r.marcadoEm.toISOString(),
  }));
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
      CACHE_TAGS.escopos,
    ],
    // TTL de 5min: a chave do cache inclui `seteDiasAtrasISO` (vide
    // page.tsx); cada virada de dia gera uma nova chave que ficaria
    // viva pra sempre com revalidate:false, inflando o cache backing
    // ao longo de semanas. 5min permite garbage collect natural e
    // ainda preserva o hit rate dentro do mesmo dia. A invalidacao
    // por mutate (revalidateTag) continua imediata.
    revalidate: 300,
  },
);
