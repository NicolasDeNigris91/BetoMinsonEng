import "server-only";
import { unstable_cache } from "next/cache";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  fotos,
  funcionarioAchados,
  funcionarios,
  mensagens,
  unidades,
  type Categoria,
} from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

export type Saude = "ok" | "warn" | "bad";

export type CategoriaCount = { categoria: Categoria; n: number };

export type EmpreendimentoLite = { id: string; nome: string };

export type FuncionarioRich = {
  id: string;
  nome: string;
  ativo: boolean;
  desativadoEm: string | null;
  pendentes: number;
  persistencias: number;
  resolvidos: number;
  totalAtribuidos: number;
  taxaResolucao: number | null;
  tempoMedioDias: number | null;
  ultimaAcaoEm: string | null;
  categorias: CategoriaCount[];
  empreendimentos: EmpreendimentoLite[];
  saude: Saude;
  mensagensNaoLidas: number;
  ultimaMensagemTexto: string | null;
  ultimaMensagemAutor: "funcionario" | "engenharia" | null;
  ultimaMensagemEm: string | null;
};

export type Kpis = {
  emCirculacao: number;
  resolvidos7d: number;
  resolvidos7dPrev: number;
  persistenciasAbertas: number;
  persistenciasVelhas: number;
  atrasados: number;
  funcionariosAtivos: number;
  funcionariosTotal: number;
  mensagensNaoLidas: number;
  mensagensFuncionariosComNaoLidas: number;
  mensagemMaisAntigaNaoLidaEm: string | null;
};

export type AlertaItem = {
  tipo:
    | "inativo"
    | "persistencia-antiga"
    | "pendente-parado"
    | "empreendimento-orfao";
  severidade: "alta" | "media";
  mensagem: string;
  detalhe?: string;
  href?: string;
};

export type FeedEvento = {
  id: string;
  tipo: "resolvido" | "persiste" | "nota" | "criado";
  funcionarioNome: string;
  achadoLocal: string | null;
  achadoDescricao: string;
  categoria: Categoria;
  empreendimentoId: string;
  empreendimentoNome: string;
  unidadeId: string;
  unidadeNome: string;
  fotosCount: number;
  notaExtra: string | null;
  createdAt: string;
};

export type EmpreendimentoStats = {
  id: string;
  nome: string;
  pendentes: number;
  persistencias: number;
  resolvidos: number;
  atrasados: number;
  funcionariosAtuando: string[];
  achadosOrfaos: number;
};

export type HeatmapCell = {
  funcionarioId: string;
  empreendimentoId: string;
  count: number;
};

export type DashboardData = {
  kpis: Kpis;
  funcionarios: FuncionarioRich[];
  alertas: AlertaItem[];
  feed: FeedEvento[];
  empreendimentos: EmpreendimentoStats[];
  mixCategoria: CategoriaCount[];
  heatmap: HeatmapCell[];
};

const DIA_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DIA_MS);
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function classificaSaude(f: {
  ativo: boolean;
  pendentes: number;
  persistencias: number;
  ultimaAcaoEm: Date | null;
  taxaResolucao: number | null;
}): Saude {
  if (!f.ativo) return "ok";
  const ultimaAcaoH = f.ultimaAcaoEm
    ? (Date.now() - f.ultimaAcaoEm.getTime()) / DIA_MS
    : Infinity;

  if (f.pendentes > 0 && ultimaAcaoH > 7) return "bad";
  if (f.pendentes > 5 && f.taxaResolucao !== null && f.taxaResolucao < 0.2)
    return "bad";

  if (f.pendentes > 12) return "warn";
  if (f.persistencias > 2) return "warn";
  if (
    f.taxaResolucao !== null &&
    f.taxaResolucao < 0.4 &&
    f.pendentes > 0
  )
    return "warn";

  return "ok";
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

async function fetchFuncionariosDashboardUncached(): Promise<DashboardData> {
  const setedias = daysAgo(7);
  const quatorzedias = daysAgo(14);
  const hojeISO = new Date().toISOString().slice(0, 10);

  // Latest event por (funcionario, achado) via NOT EXISTS — evita carregar
  // a tabela de eventos pro Node so pra agregar.
  const persistenciasLatestSql = sql`
    SELECT
      ae.funcionario_origem_id AS funcionario_id,
      u.empreendimento_id,
      ae.achado_id,
      ae.created_at,
      ae.nota_extra,
      a.local AS achado_local,
      a.descricao AS achado_descricao,
      f.nome AS funcionario_nome,
      e.nome AS empreendimento_nome
    FROM ${achadoEventos} ae
    INNER JOIN ${achados} a ON a.id = ae.achado_id
    INNER JOIN ${unidades} u ON u.id = a.unidade_id
    INNER JOIN ${empreendimentos} e ON e.id = u.empreendimento_id
    INNER JOIN ${funcionarios} f ON f.id = ae.funcionario_origem_id
    WHERE ae.tipo = 'persiste'
      AND ae.funcionario_origem_id IS NOT NULL
      AND a.status = 'aberto'
      AND NOT EXISTS (
        SELECT 1 FROM ${achadoEventos} ae2
        WHERE ae2.funcionario_origem_id = ae.funcionario_origem_id
          AND ae2.achado_id = ae.achado_id
          AND ae2.created_at > ae.created_at
      )
  `;

  const [
    funcionariosRaw,
    statsPorFunc,
    persistenciasRaw,
    tempoPorFunc,
    catPorFunc,
    empPorFunc,
    heatmapRaw,
    mixGlobalRaw,
    empStatsRaw,
    ultimaAcaoRaw,
    empreendimentosTodos,
    achadosOrfaosPorEmp,
    feedRaw,
    persistenciasAntigasRaw,
    resolvidosPeriodoRaw,
    kpisGlobaisRaw,
    msgNaoLidasPorFunc,
    msgUltimaPorFuncRaw,
    msgKpiRaw,
  ] = await Promise.all([
    db
      .select({
        id: funcionarios.id,
        nome: funcionarios.nome,
        desativadoEm: funcionarios.desativadoEm,
      })
      .from(funcionarios)
      .orderBy(
        sql`${funcionarios.desativadoEm} IS NULL DESC`,
        desc(funcionarios.atualizadoEm),
      ),

    db
      .select({
        funcionarioId: funcionarioAchados.funcionarioId,
        total: sql<number>`count(*)::int`,
        resolvidos: sql<number>`count(*) filter (where ${achados.status} = 'resolvido')::int`,
        atrasados: sql<number>`count(*) filter (where ${achados.status} = 'aberto' and ${achados.prazoEm} < ${hojeISO}::date)::int`,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
      .groupBy(funcionarioAchados.funcionarioId),

    db.execute(sql`${persistenciasLatestSql}`),

    db
      .select({
        funcionarioId: funcionarioAchados.funcionarioId,
        dias: sql<number>`(avg(extract(epoch from (${achadoEventos.createdAt} - ${funcionarioAchados.atribuidoEm})) / 86400))::float`,
      })
      .from(funcionarioAchados)
      .innerJoin(
        achadoEventos,
        and(
          eq(achadoEventos.achadoId, funcionarioAchados.achadoId),
          eq(
            achadoEventos.funcionarioOrigemId,
            funcionarioAchados.funcionarioId,
          ),
          eq(achadoEventos.tipo, "resolvido"),
        ),
      )
      .groupBy(funcionarioAchados.funcionarioId),

    db
      .select({
        funcionarioId: funcionarioAchados.funcionarioId,
        categoria: achados.categoria,
        n: sql<number>`count(*)::int`,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
      .groupBy(funcionarioAchados.funcionarioId, achados.categoria),

    db
      .selectDistinct({
        funcionarioId: funcionarioAchados.funcionarioId,
        empreendimentoId: empreendimentos.id,
        empreendimentoNome: empreendimentos.nome,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .orderBy(empreendimentos.nome),

    db
      .select({
        funcionarioId: funcionarioAchados.funcionarioId,
        empreendimentoId: empreendimentos.id,
        n: sql<number>`count(*)::int`,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(eq(achados.status, "aberto"))
      .groupBy(funcionarioAchados.funcionarioId, empreendimentos.id),

    db
      .select({
        categoria: achados.categoria,
        n: sql<number>`count(distinct ${achados.id})::int`,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
      .where(eq(achados.status, "aberto"))
      .groupBy(achados.categoria),

    db
      .select({
        empreendimentoId: empreendimentos.id,
        pendentes: sql<number>`count(distinct ${achados.id}) filter (where ${achados.status} = 'aberto')::int`,
        resolvidos: sql<number>`count(distinct ${achados.id}) filter (where ${achados.status} = 'resolvido')::int`,
        atrasados: sql<number>`count(distinct ${achados.id}) filter (where ${achados.status} = 'aberto' and ${achados.prazoEm} < ${hojeISO}::date)::int`,
        funcionarioIds: sql<string[]>`array_agg(distinct ${funcionarioAchados.funcionarioId})`,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .groupBy(empreendimentos.id),

    db
      .select({
        funcionarioId: achadoEventos.funcionarioOrigemId,
        ultima: sql<Date>`max(${achadoEventos.createdAt})`,
      })
      .from(achadoEventos)
      .where(sql`${achadoEventos.funcionarioOrigemId} IS NOT NULL`)
      .groupBy(achadoEventos.funcionarioOrigemId),

    db
      .select({ id: empreendimentos.id, nome: empreendimentos.nome })
      .from(empreendimentos)
      .orderBy(empreendimentos.nome),

    db
      .select({
        empreendimentoId: empreendimentos.id,
        empreendimentoNome: empreendimentos.nome,
        n: sql<number>`count(*)::int`,
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .leftJoin(
        funcionarioAchados,
        eq(funcionarioAchados.achadoId, achados.id),
      )
      .where(
        and(
          eq(achados.status, "aberto"),
          isNull(funcionarioAchados.achadoId),
        ),
      )
      .groupBy(empreendimentos.id, empreendimentos.nome),

    // LEFT JOIN + GROUP BY pra contar fotos: subquery correlata por linha
    // era N+1 com LIMIT 20.
    db
      .select({
        eventoId: achadoEventos.id,
        tipo: achadoEventos.tipo,
        createdAt: achadoEventos.createdAt,
        notaExtra: achadoEventos.notaExtra,
        funcionarioNome: funcionarios.nome,
        achadoLocal: achados.local,
        achadoDescricao: achados.descricao,
        categoria: achados.categoria,
        unidadeId: unidades.id,
        unidadeNome: unidades.nome,
        empreendimentoId: empreendimentos.id,
        empreendimentoNome: empreendimentos.nome,
        fotosCount: sql<number>`count(${fotos.id})::int`,
      })
      .from(achadoEventos)
      .innerJoin(
        funcionarios,
        eq(funcionarios.id, achadoEventos.funcionarioOrigemId),
      )
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .leftJoin(fotos, eq(fotos.achadoEventoId, achadoEventos.id))
      .groupBy(
        achadoEventos.id,
        funcionarios.nome,
        achados.local,
        achados.descricao,
        achados.categoria,
        unidades.id,
        unidades.nome,
        empreendimentos.id,
        empreendimentos.nome,
      )
      .orderBy(desc(achadoEventos.createdAt))
      .limit(20),

    db
      .select({
        eventoId: achadoEventos.id,
        funcionarioId: achadoEventos.funcionarioOrigemId,
        funcionarioNome: funcionarios.nome,
        achadoLocal: achados.local,
        achadoDescricao: achados.descricao,
        empreendimentoNome: empreendimentos.nome,
        createdAt: achadoEventos.createdAt,
        notaExtra: achadoEventos.notaExtra,
      })
      .from(achadoEventos)
      .innerJoin(
        funcionarios,
        eq(funcionarios.id, achadoEventos.funcionarioOrigemId),
      )
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        empreendimentos,
        eq(empreendimentos.id, unidades.empreendimentoId),
      )
      .where(
        and(
          eq(achadoEventos.tipo, "persiste"),
          eq(achados.status, "aberto"),
          lte(achadoEventos.createdAt, quatorzedias),
        ),
      )
      .orderBy(achadoEventos.createdAt)
      .limit(5),

    // postgres-js nao encoda Date em sql`...` cru, so via helpers tipados
    // (gte/lte). Aqui o FILTER e sql cru, entao precisa ISO + cast.
    db
      .select({
        r7: sql<number>`count(*) filter (where ${achadoEventos.createdAt} >= ${setedias.toISOString()}::timestamptz)::int`,
        r7prev: sql<number>`count(*) filter (where ${achadoEventos.createdAt} >= ${quatorzedias.toISOString()}::timestamptz and ${achadoEventos.createdAt} < ${setedias.toISOString()}::timestamptz)::int`,
      })
      .from(achadoEventos)
      .where(
        and(
          eq(achadoEventos.tipo, "resolvido"),
          sql`${achadoEventos.funcionarioOrigemId} IS NOT NULL`,
          gte(achadoEventos.createdAt, quatorzedias),
        ),
      ),

    db
      .select({
        emCirculacao: sql<number>`count(distinct ${achados.id}) filter (where ${achados.status} = 'aberto')::int`,
        atrasados: sql<number>`count(distinct ${achados.id}) filter (where ${achados.status} = 'aberto' and ${achados.prazoEm} < ${hojeISO}::date)::int`,
      })
      .from(funcionarioAchados)
      .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId)),

    db
      .select({
        funcionarioId: mensagens.funcionarioId,
        nNaoLidas: sql<number>`count(*) filter (where ${mensagens.autor} = 'funcionario' and ${mensagens.lidoEm} is null)::int`,
      })
      .from(mensagens)
      .groupBy(mensagens.funcionarioId),

    db.execute(sql`
      SELECT DISTINCT ON (funcionario_id)
        funcionario_id, texto, autor, criado_em
      FROM ${mensagens}
      ORDER BY funcionario_id, criado_em DESC
    `),

    db
      .select({
        total: sql<number>`count(*) filter (where ${mensagens.autor} = 'funcionario' and ${mensagens.lidoEm} is null)::int`,
        funcionariosCom: sql<number>`count(distinct ${mensagens.funcionarioId}) filter (where ${mensagens.autor} = 'funcionario' and ${mensagens.lidoEm} is null)::int`,
        maisAntiga: sql<Date | null>`min(${mensagens.criadoEm}) filter (where ${mensagens.autor} = 'funcionario' and ${mensagens.lidoEm} is null)`,
      })
      .from(mensagens),
  ]);

  const statsMap = new Map(
    statsPorFunc.map((s) => [
      s.funcionarioId,
      {
        total: Number(s.total),
        resolvidos: Number(s.resolvidos),
        atrasados: Number(s.atrasados),
      },
    ]),
  );

  const tempoMap = new Map(
    tempoPorFunc.map((t) => [t.funcionarioId, Number(t.dias)]),
  );

  type PersistRow = {
    funcionario_id: string;
    empreendimento_id: string;
    achado_id: string;
    created_at: Date;
    nota_extra: string | null;
    achado_local: string | null;
    achado_descricao: string;
    funcionario_nome: string;
    empreendimento_nome: string;
  };
  const persistencias = (
    persistenciasRaw as unknown as PersistRow[]
  ).map((r) => ({
    funcionarioId: r.funcionario_id,
    empreendimentoId: r.empreendimento_id,
    achadoId: r.achado_id,
    createdAt: toDate(r.created_at),
    notaExtra: r.nota_extra,
    achadoLocal: r.achado_local,
    achadoDescricao: r.achado_descricao,
    funcionarioNome: r.funcionario_nome,
    empreendimentoNome: r.empreendimento_nome,
  }));

  const persistMap = new Map<
    string,
    { n: number; velhas: number; porEmp: Map<string, number> }
  >();
  for (const p of persistencias) {
    let bucket = persistMap.get(p.funcionarioId);
    if (!bucket) {
      bucket = { n: 0, velhas: 0, porEmp: new Map() };
      persistMap.set(p.funcionarioId, bucket);
    }
    bucket.n++;
    if (p.createdAt <= quatorzedias) bucket.velhas++;
    bucket.porEmp.set(
      p.empreendimentoId,
      (bucket.porEmp.get(p.empreendimentoId) ?? 0) + 1,
    );
  }

  const catMap = new Map<string, CategoriaCount[]>();
  for (const c of catPorFunc) {
    const arr = catMap.get(c.funcionarioId) ?? [];
    arr.push({ categoria: c.categoria as Categoria, n: Number(c.n) });
    catMap.set(c.funcionarioId, arr);
  }
  for (const arr of catMap.values()) arr.sort((x, y) => y.n - x.n);

  const empCobertosMap = new Map<string, EmpreendimentoLite[]>();
  for (const e of empPorFunc) {
    const arr = empCobertosMap.get(e.funcionarioId) ?? [];
    arr.push({ id: e.empreendimentoId, nome: e.empreendimentoNome });
    empCobertosMap.set(e.funcionarioId, arr);
  }

  const ultimaAcaoMap = new Map<string, Date>();
  for (const r of ultimaAcaoRaw) {
    if (r.funcionarioId && r.ultima) {
      ultimaAcaoMap.set(r.funcionarioId, toDate(r.ultima));
    }
  }

  const msgNaoLidasMap = new Map(
    msgNaoLidasPorFunc.map((m) => [m.funcionarioId, Number(m.nNaoLidas)]),
  );
  type UltimaMsgRow = {
    funcionario_id: string;
    texto: string;
    autor: "funcionario" | "engenharia";
    criado_em: Date;
  };
  const ultimaMsgMap = new Map<
    string,
    { texto: string; autor: "funcionario" | "engenharia"; criadoEm: Date }
  >();
  for (const m of msgUltimaPorFuncRaw as unknown as UltimaMsgRow[]) {
    ultimaMsgMap.set(m.funcionario_id, {
      texto: m.texto,
      autor: m.autor,
      criadoEm: toDate(m.criado_em),
    });
  }

  const funcionariosRich: FuncionarioRich[] = funcionariosRaw.map((f) => {
    const stats = statsMap.get(f.id);
    const persist = persistMap.get(f.id);
    const totalAtribuidos = stats?.total ?? 0;
    const resolvidos = stats?.resolvidos ?? 0;
    const pendentes = totalAtribuidos - resolvidos;
    const persistencias = persist?.n ?? 0;
    const taxaResolucao =
      totalAtribuidos > 0 ? resolvidos / totalAtribuidos : null;
    const tempoMedioDias = tempoMap.get(f.id) ?? null;
    const ultimaAcao = ultimaAcaoMap.get(f.id) ?? null;
    const ativo = f.desativadoEm === null;
    const saude = classificaSaude({
      ativo,
      pendentes,
      persistencias,
      ultimaAcaoEm: ultimaAcao,
      taxaResolucao,
    });
    const ultimaMsg = ultimaMsgMap.get(f.id) ?? null;
    return {
      id: f.id,
      nome: f.nome,
      ativo,
      desativadoEm: isoOrNull(f.desativadoEm),
      pendentes,
      persistencias,
      resolvidos,
      totalAtribuidos,
      taxaResolucao,
      tempoMedioDias,
      ultimaAcaoEm: isoOrNull(ultimaAcao),
      categorias: catMap.get(f.id) ?? [],
      empreendimentos: empCobertosMap.get(f.id) ?? [],
      saude,
      mensagensNaoLidas: msgNaoLidasMap.get(f.id) ?? 0,
      ultimaMensagemTexto: ultimaMsg?.texto ?? null,
      ultimaMensagemAutor: ultimaMsg?.autor ?? null,
      ultimaMensagemEm: ultimaMsg ? ultimaMsg.criadoEm.toISOString() : null,
    };
  });

  const persistenciasAbertas = persistencias.length;
  const persistenciasVelhas = persistencias.filter(
    (p) => p.createdAt <= quatorzedias,
  ).length;

  const kpisGlobais = kpisGlobaisRaw[0] ?? { emCirculacao: 0, atrasados: 0 };
  const resolvidosPeriodo = resolvidosPeriodoRaw[0] ?? { r7: 0, r7prev: 0 };

  const funcionariosAtivos = funcionariosRaw.filter(
    (f) => f.desativadoEm === null,
  ).length;
  const funcionariosTotal = funcionariosRaw.length;

  const msgKpi = msgKpiRaw[0] ?? {
    total: 0,
    funcionariosCom: 0,
    maisAntiga: null,
  };

  const kpis: Kpis = {
    emCirculacao: Number(kpisGlobais.emCirculacao),
    resolvidos7d: Number(resolvidosPeriodo.r7),
    resolvidos7dPrev: Number(resolvidosPeriodo.r7prev),
    persistenciasAbertas,
    persistenciasVelhas,
    atrasados: Number(kpisGlobais.atrasados),
    funcionariosAtivos,
    funcionariosTotal,
    mensagensNaoLidas: Number(msgKpi.total),
    mensagensFuncionariosComNaoLidas: Number(msgKpi.funcionariosCom),
    mensagemMaisAntigaNaoLidaEm: msgKpi.maisAntiga
      ? toDate(msgKpi.maisAntiga).toISOString()
      : null,
  };

  const alertas: AlertaItem[] = [];

  for (const fr of funcionariosRich) {
    if (!fr.ativo) continue;
    if (fr.saude === "bad" && fr.pendentes > 0) {
      const diasSemAcao = fr.ultimaAcaoEm
        ? Math.floor(
            (Date.now() - new Date(fr.ultimaAcaoEm).getTime()) / DIA_MS,
          )
        : null;
      alertas.push({
        tipo: "inativo",
        severidade: "alta",
        mensagem: `${fr.nome} está ${
          diasSemAcao !== null ? `há ${diasSemAcao} dias` : "sem registro"
        } sem agir, mas tem ${fr.pendentes} pendente${
          fr.pendentes === 1 ? "" : "s"
        }.`,
        href: `/funcionarios/${fr.id}`,
      });
    }
  }

  for (const p of persistenciasAntigasRaw) {
    const dias = Math.floor(
      (Date.now() - toDate(p.createdAt).getTime()) / DIA_MS,
    );
    const ondeBase = p.achadoLocal
      ? `${p.achadoLocal}`
      : p.achadoDescricao.slice(0, 40);
    alertas.push({
      tipo: "persistencia-antiga",
      severidade: "media",
      mensagem: `Persistência há ${dias}d: ${ondeBase} (${p.empreendimentoNome}) por ${p.funcionarioNome}.`,
      detalhe: p.notaExtra ?? undefined,
      href: p.funcionarioId
        ? `/funcionarios/${p.funcionarioId}`
        : undefined,
    });
  }

  for (const o of achadosOrfaosPorEmp) {
    const n = Number(o.n);
    if (n > 0) {
      alertas.push({
        tipo: "empreendimento-orfao",
        severidade: "media",
        mensagem: `${o.empreendimentoNome}: ${n} achado${
          n === 1 ? "" : "s"
        } em aberto sem funcionário atribuído.`,
      });
    }
  }

  const feed: FeedEvento[] = feedRaw.map((r) => ({
    id: r.eventoId,
    tipo: r.tipo as FeedEvento["tipo"],
    funcionarioNome: r.funcionarioNome,
    achadoLocal: r.achadoLocal,
    achadoDescricao: r.achadoDescricao,
    categoria: r.categoria as Categoria,
    empreendimentoId: r.empreendimentoId,
    empreendimentoNome: r.empreendimentoNome,
    unidadeId: r.unidadeId,
    unidadeNome: r.unidadeNome,
    fotosCount: Number(r.fotosCount ?? 0),
    notaExtra: r.notaExtra,
    createdAt: toDate(r.createdAt).toISOString(),
  }));

  const funcionariosNomeMap = new Map(
    funcionariosRaw.map((f) => [f.id, f.nome]),
  );
  const empStatsMap = new Map(
    empStatsRaw.map((e) => [e.empreendimentoId, e]),
  );
  const orfaosPorEmpMap = new Map(
    achadosOrfaosPorEmp.map((o) => [o.empreendimentoId, Number(o.n)]),
  );
  const persistPorEmp = new Map<string, number>();
  for (const bucket of persistMap.values()) {
    for (const [empId, n] of bucket.porEmp.entries()) {
      persistPorEmp.set(empId, (persistPorEmp.get(empId) ?? 0) + n);
    }
  }
  const empreendimentosStats: EmpreendimentoStats[] = empreendimentosTodos
    .map((e) => {
      const s = empStatsMap.get(e.id);
      const funcIds: string[] = Array.isArray(s?.funcionarioIds)
        ? (s!.funcionarioIds as string[]).filter(Boolean)
        : [];
      return {
        id: e.id,
        nome: e.nome,
        pendentes: Number(s?.pendentes ?? 0),
        persistencias: persistPorEmp.get(e.id) ?? 0,
        resolvidos: Number(s?.resolvidos ?? 0),
        atrasados: Number(s?.atrasados ?? 0),
        funcionariosAtuando: funcIds
          .map((fid) => funcionariosNomeMap.get(fid) ?? "")
          .filter(Boolean),
        achadosOrfaos: orfaosPorEmpMap.get(e.id) ?? 0,
      };
    });
  empreendimentosStats.sort(
    (x, y) =>
      y.atrasados - x.atrasados ||
      y.pendentes - x.pendentes ||
      x.nome.localeCompare(y.nome),
  );

  const mixCategoria: CategoriaCount[] = mixGlobalRaw
    .map((m) => ({ categoria: m.categoria as Categoria, n: Number(m.n) }))
    .sort((x, y) => y.n - x.n);

  const heatmap: HeatmapCell[] = heatmapRaw.map((h) => ({
    funcionarioId: h.funcionarioId,
    empreendimentoId: h.empreendimentoId,
    count: Number(h.n),
  }));

  return {
    kpis,
    funcionarios: funcionariosRich,
    alertas,
    feed,
    empreendimentos: empreendimentosStats,
    mixCategoria,
    heatmap,
  };
}

export const fetchFuncionariosDashboard = unstable_cache(
  fetchFuncionariosDashboardUncached,
  ["funcionarios-dashboard"],
  {
    tags: [
      CACHE_TAGS.funcionarios,
      CACHE_TAGS.achados,
      CACHE_TAGS.empreendimentos,
      CACHE_TAGS.mensagens,
    ],
    revalidate: 60,
  },
);
