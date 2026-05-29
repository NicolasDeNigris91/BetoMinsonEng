import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, and, count, asc, sql } from "drizzle-orm";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Plus,
  StickyNote,
} from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  ResolverPendenciasDialog,
  type PendenciaView,
} from "@/components/resolver-pendencias-dialog";
import { db } from "@/db";
import {
  empreendimentos,
  unidades,
  vistorias,
  achados,
  achadoEventos,
  categoriaEnum,
  CATEGORIA_LABELS,
  type AchadoStatus,
  type Categoria,
} from "@/db/schema";
import { evaluatePrazo, formatDate } from "@/lib/format";
import { getDateFormat } from "@/lib/date-format-server";
import { parseUuidOrNotFound } from "@/lib/route-params";
import {
  CATEGORIA_DOT,
  VISTORIA_STATUS_BADGE,
  VISTORIA_STATUS_STRIPE,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { NovaVistoriaDialog } from "./nova-vistoria-dialog";
import { UnidadeActionsMenu } from "./unidade-actions-menu";
import { UnidadeShortcuts } from "./unidade-shortcuts";
import {
  UnidadeFilters,
  type StatusFilter,
} from "./unidade-filters";

export const dynamic = "force-dynamic";

type EventoView = {
  achadoId: string;
  categoria: Categoria;
};

type AchadoLite = {
  id: string;
  categoria: Categoria;
  status: AchadoStatus;
  prazoEm: string | null;
};

type TileStats = {
  total: number;
  abertos: number;
  resolvidos: number;
  atrasados: number;
};

const VALID_STATUS: StatusFilter[] = ["todos", "aberto", "atrasado", "resolvido"];

function parseSearchParams(sp: { cat?: string; status?: string }): {
  selectedCategorias: Categoria[];
  selectedStatus: StatusFilter;
} {
  const validCats = new Set<Categoria>(categoriaEnum.enumValues);
  const selectedCategorias = (sp.cat ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Categoria => validCats.has(s as Categoria));
  const statusParam = (sp.status ?? "todos") as StatusFilter;
  const selectedStatus: StatusFilter = VALID_STATUS.includes(statusParam)
    ? statusParam
    : "todos";
  return { selectedCategorias, selectedStatus };
}

function achadoMatchesFilter(
  achado: { categoria: Categoria; status: AchadoStatus; prazoEm: string | null },
  selectedCategorias: Categoria[],
  selectedStatus: StatusFilter,
): boolean {
  if (selectedCategorias.length > 0 && !selectedCategorias.includes(achado.categoria)) {
    return false;
  }
  if (selectedStatus === "todos") return true;
  if (selectedStatus === "resolvido") return achado.status === "resolvido";
  if (selectedStatus === "aberto") return achado.status === "aberto";
  // atrasado = aberto com prazo vencido
  if (achado.status !== "aberto") return false;
  const prazo = evaluatePrazo(achado.prazoEm);
  return prazo?.kind === "atrasado";
}

// Ordem fixa do enum pra tiles ficarem consistentes entre vistorias.
const ORDEM_CATEGORIA: Categoria[] = [
  "ELE",
  "HID",
  "HVAC",
  "PISCINA",
  "ASP",
  "SIS",
];

/**
 * Agrupa achados por (vistoria × categoria) e conta status atual. Achado
 * pode ter virios eventos na mesma vistoria — dedupe via Set garante
 * uma contagem por achado, nao por evento. Eventos chegam ja filtrados
 * pelo filtro ativo da pagina (status/categoria), entao a contagem aqui
 * reflete o filtro.
 */
export function buildTilesByVistoria(
  eventosByVistoria: Map<string, EventoView[]>,
  achadoById: Map<string, AchadoLite>,
): Map<string, Map<Categoria, TileStats>> {
  const result = new Map<string, Map<Categoria, TileStats>>();
  for (const [vid, eventos] of eventosByVistoria) {
    const achadosPorCat = new Map<Categoria, Set<string>>();
    for (const ev of eventos) {
      const set = achadosPorCat.get(ev.categoria) ?? new Set<string>();
      set.add(ev.achadoId);
      achadosPorCat.set(ev.categoria, set);
    }
    const tilesPorCat = new Map<Categoria, TileStats>();
    for (const [cat, achadoIds] of achadosPorCat) {
      let abertos = 0;
      let resolvidos = 0;
      let atrasados = 0;
      for (const aId of achadoIds) {
        const a = achadoById.get(aId);
        if (!a) continue;
        if (a.status === "resolvido") {
          resolvidos++;
        } else if (a.status === "aberto") {
          abertos++;
          if (evaluatePrazo(a.prazoEm)?.kind === "atrasado") atrasados++;
        }
      }
      tilesPorCat.set(cat, { total: achadoIds.size, abertos, resolvidos, atrasados });
    }
    result.set(vid, tilesPorCat);
  }
  return result;
}

export default async function UnidadeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; uid: string }>;
  searchParams: Promise<{ cat?: string; status?: string }>;
}) {
  const [{ id: rawId, uid: rawUid }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  const id = parseUuidOrNotFound(rawId);
  const uid = parseUuidOrNotFound(rawUid);
  const { selectedCategorias, selectedStatus } = parseSearchParams(sp);
  const dateFmt = await getDateFormat();

  const [
    [unidade],
    [emp],
    vistoriasList,
    [achadosCounts],
    achadosDaUnidade,
    eventosRows,
    achadosAbertosRows,
  ] = await Promise.all([
    db
      .select()
      .from(unidades)
      .where(and(eq(unidades.id, uid), eq(unidades.empreendimentoId, id)))
      .limit(1),
    db
      .select()
      .from(empreendimentos)
      .where(eq(empreendimentos.id, id))
      .limit(1),
    db
      .select()
      .from(vistorias)
      .where(eq(vistorias.unidadeId, uid))
      .orderBy(desc(vistorias.data), desc(vistorias.createdAt)),
    db
      .select({
        total: count(),
        abertos: sql<number>`count(*) filter (where ${achados.status} = 'aberto')`,
        resolvidos: sql<number>`count(*) filter (where ${achados.status} = 'resolvido')`,
      })
      .from(achados)
      .where(eq(achados.unidadeId, uid)),
    // Todos os achados da unidade — usado pra: contagem por categoria (chips),
    // mapa de status/prazo (filtro), e categorias presentes (quais chips mostrar).
    db
      .select({
        id: achados.id,
        categoria: achados.categoria,
        status: achados.status,
        prazoEm: achados.prazoEm,
      })
      .from(achados)
      .where(eq(achados.unidadeId, uid)),
    // Eventos por vistoria — alimentam as tiles por matéria no card.
    // Sem id/tipo/createdAt: o card mostra contagens, nao o log linha
    // a linha (esse vive em /vistorias/[vid]).
    db
      .select({
        vistoriaId: achadoEventos.vistoriaId,
        achadoId: achadoEventos.achadoId,
        categoria: achados.categoria,
      })
      .from(achadoEventos)
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
      .where(eq(vistorias.unidadeId, uid))
      .orderBy(asc(achadoEventos.createdAt)),
    // Achados em aberto da unidade — base do dialog de pendencias por rascunho.
    db
      .select({
        id: achados.id,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        prazoEm: achados.prazoEm,
        vistoriaOrigemId: achados.vistoriaOrigemId,
      })
      .from(achados)
      .where(and(eq(achados.unidadeId, uid), eq(achados.status, "aberto"))),
  ]);

  if (!unidade || !emp) notFound();

  // Mapa achadoId -> dados — base do filtro aplicado em event rows.
  const achadoById = new Map(achadosDaUnidade.map((a) => [a.id, a]));

  // Conjunto de achadoIds que batem o filtro atual.
  const achadosFiltradosIds = new Set(
    achadosDaUnidade
      .filter((a) => achadoMatchesFilter(a, selectedCategorias, selectedStatus))
      .map((a) => a.id),
  );

  // Contagem total de achados por categoria (sem filtro) — exibida nos chips.
  const totaisPorCategoria: Record<Categoria, number> = {
    ELE: 0,
    HID: 0,
    HVAC: 0,
    PISCINA: 0,
    ASP: 0,
    SIS: 0,
  };
  for (const a of achadosDaUnidade) totaisPorCategoria[a.categoria]++;

  const hasFilter =
    selectedCategorias.length > 0 || selectedStatus !== "todos";

  // (vistoriaId -> EventoView[]) — eventos filtrados pelo estado/categoria
  // do achado correspondente. Alimenta o calculo das tiles por matéria.
  const eventosByVistoria = new Map<string, EventoView[]>();
  for (const row of eventosRows) {
    if (!achadosFiltradosIds.has(row.achadoId)) continue;
    const arr = eventosByVistoria.get(row.vistoriaId) ?? [];
    arr.push(row);
    eventosByVistoria.set(row.vistoriaId, arr);
  }

  const tilesByVistoria = buildTilesByVistoria(eventosByVistoria, achadoById);

  const categoriasPresentes: Categoria[] = ORDEM_CATEGORIA.filter(
    (c) => totaisPorCategoria[c] > 0,
  );

  // Pendencias globais da unidade — alimenta o botao "Resolver pendencias"
  // no header. Aplica o filtro ativo: se o usuario filtrou pra "atrasado HID",
  // o botao mostra a contagem e as pendencias dessa fatia.
  const pendenciasGlobais: PendenciaView[] = achadosAbertosRows
    .filter((a) => {
      const achado = achadoById.get(a.id);
      if (!achado) return false;
      return achadoMatchesFilter(achado, selectedCategorias, selectedStatus);
    })
    .map((a) => ({
      id: a.id,
      categoria: a.categoria,
      local: a.local,
      descricao: a.descricao,
      prazoEm: a.prazoEm,
    }));

  // Vistorias visiveis: quando ha filtro, esconde vistorias que ficaram
  // sem nenhum event row depois do filtro.
  const vistoriasVisiveis = hasFilter
    ? vistoriasList.filter((v) => (eventosByVistoria.get(v.id)?.length ?? 0) > 0)
    : vistoriasList;

  return (
    <div className="space-y-6">
      <UnidadeShortcuts
        historicoHref={`/empreendimentos/${id}/unidades/${unidade.id}/historico`}
      />
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${id}` },
          { label: unidade.nome },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            {unidade.nome}
          </h1>
          {unidade.observacoes ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="self-start pt-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <StickyNote className="size-3" />
                  Notas
                </span>
              </dt>
              <dd className="rounded-md bg-muted/40 px-2.5 py-1.5 text-sm whitespace-pre-line text-foreground/90">
                {unidade.observacoes}
              </dd>
            </dl>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={`/empreendimentos/${id}/unidades/${unidade.id}/historico`} />
            }
          >
            <History className="mr-1.5 size-4" />
            Histórico
          </Button>
          <UnidadeActionsMenu empreendimentoId={id} unidade={unidade} />
        </div>
      </div>

      <UnidadeFilters
        categoriasPresentes={categoriasPresentes}
        totaisPorCategoria={totaisPorCategoria}
        selectedCategorias={selectedCategorias}
        selectedStatus={selectedStatus}
        matchCount={achadosFiltradosIds.size}
        totalCount={achadosDaUnidade.length}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
              Vistorias
            </h2>
            {vistoriasList.length > 0 ? (
              <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                <span className="tabular-nums text-foreground">
                  {String(vistoriasList.length).padStart(2, "0")}
                </span>{" "}
                {vistoriasList.length === 1 ? "vistoria" : "vistorias"} ·{" "}
                <span className="tabular-nums text-amber-700 dark:text-amber-300">
                  {String(Number(achadosCounts?.abertos ?? 0)).padStart(2, "0")}
                </span>{" "}
                abertos
                {Number(achadosCounts?.resolvidos ?? 0) > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                      {String(Number(achadosCounts.resolvidos)).padStart(2, "0")}
                    </span>{" "}
                    resolvidos
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendenciasGlobais.length > 0 ? (
              <ResolverPendenciasDialog
                pendencias={pendenciasGlobais}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] uppercase text-brand-foreground shadow-[0_1px_0_rgba(255,128,0,0.4),0_4px_12px_rgba(255,128,0,0.18)] transition-transform hover:-translate-y-px"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Resolver pendências ({pendenciasGlobais.length})
                  </button>
                }
              />
            ) : null}
            {/* CTA do topo so aparece quando ja existem vistorias.
                Quando vazio, o CTA do empty state e a unica acao primaria. */}
            {vistoriasList.length > 0 ? (
              <NovaVistoriaDialog
                unidadeId={unidade.id}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" />
                    Nova vistoria
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>

        {vistoriasList.length === 0 ? (
          <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
            <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center">
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                <ClipboardList
                  className="size-8 text-muted-foreground/60"
                  aria-hidden
                />
              </div>
              <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Sem vistorias registradas
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie a primeira vistoria pra começar a registrar achados.
              </p>
              <div className="mt-4">
                <NovaVistoriaDialog
                  unidadeId={unidade.id}
                  trigger={
                    <Button size="sm">
                      <Plus className="mr-1.5 size-4" />
                      Criar primeira vistoria
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        ) : vistoriasVisiveis.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
            Nenhuma vistoria com achados que combinam com o filtro atual.
          </p>
        ) : (
          <div className="space-y-2">
            {vistoriasVisiveis.map((v) => {
              const tiles = tilesByVistoria.get(v.id);
              const tilesOrdenadas = tiles
                ? ORDEM_CATEGORIA.filter((c) => tiles.has(c)).map(
                    (c) => [c, tiles.get(c)!] as const,
                  )
                : [];
              const href = `/empreendimentos/${id}/unidades/${unidade.id}/vistorias/${v.id}`;

              return (
                <div
                  key={v.id}
                  className="relative overflow-hidden rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring"
                >
                  <div
                    aria-hidden
                    className={`absolute top-0 bottom-0 left-0 z-10 w-[3px] ${VISTORIA_STATUS_STRIPE[v.status]}`}
                  />

                  <div className="flex items-center justify-between gap-3 px-5 py-4 pr-40">
                    <div className="space-y-0.5">
                      <p className="text-base font-semibold text-foreground">
                        Vistoria de{" "}
                        <span className="font-tech">
                          {formatDate(v.data, dateFmt)}
                        </span>
                      </p>
                      {v.vistoriadorNome ? (
                        <p className="text-xs text-muted-foreground">
                          {v.vistoriadorNome}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {tilesOrdenadas.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 border-t border-dashed border-border/70 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
                      {tilesOrdenadas.map(([cat, stats]) => {
                        const label = CATEGORIA_LABELS[cat].toLowerCase();
                        const semAbertos = stats.abertos === 0;
                        const pct =
                          stats.total > 0
                            ? Math.round((stats.resolvidos / stats.total) * 100)
                            : 0;
                        return (
                          <Link
                            key={cat}
                            href={href}
                            className={cn(
                              "group relative block rounded-md border border-border px-3.5 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              semAbertos
                                ? "border-emerald-300/70 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
                                : "bg-muted/40 hover:bg-muted",
                            )}
                            aria-label={`${label}: ${stats.abertos} abertos, ${stats.resolvidos} resolvidos`}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span
                                aria-hidden
                                className={cn(
                                  "inline-block size-2 rounded-full",
                                  CATEGORIA_DOT[cat],
                                )}
                              />
                              <span className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-foreground">
                                {label}
                              </span>
                              {stats.atrasados > 0 ? (
                                <span className="ml-auto font-mono text-[9px] font-bold tracking-[0.08em] uppercase text-rose-700 dark:text-rose-300">
                                  {stats.atrasados} atrasado
                                  {stats.atrasados === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span
                                className={cn(
                                  "font-mono text-2xl font-bold tabular-nums leading-none",
                                  semAbertos
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-amber-700 dark:text-amber-300",
                                )}
                              >
                                {semAbertos ? "ok" : stats.abertos}
                              </span>
                              {!semAbertos ? (
                                <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
                                  {stats.abertos === 1 ? "aberto" : "abertos"}
                                </span>
                              ) : null}
                              {stats.resolvidos > 0 ? (
                                <span className="font-mono text-[10px] tabular-nums text-emerald-700 dark:text-emerald-300">
                                  · {stats.resolvidos} resolvido
                                  {stats.resolvidos === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-foreground/10">
                              <span
                                className="block h-full bg-emerald-500 dark:bg-emerald-400"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between border-t border-dashed border-border/70 bg-muted/30 px-5 py-2">
                    <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                      {tilesOrdenadas.length > 0
                        ? "Clique numa matéria pra abrir"
                        : "Vistoria sem achados"}
                    </span>
                    <Link
                      href={href}
                      className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-foreground transition hover:underline"
                      aria-label={`Abrir vistoria de ${formatDate(v.data, dateFmt)}`}
                    >
                      Abrir vistoria →
                    </Link>
                  </div>

                  <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                    <Link
                      href={`/api/pdf/${v.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[9px] font-semibold tracking-[0.08em] uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={`Baixar PDF da vistoria de ${formatDate(v.data, dateFmt)}`}
                      title="Baixar PDF desta vistoria"
                    >
                      <FileText className="size-3" />
                      PDF
                    </Link>
                    <span
                      className={`rounded-sm border px-1.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] uppercase ${VISTORIA_STATUS_BADGE[v.status].className}`}
                    >
                      {VISTORIA_STATUS_BADGE[v.status].label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
