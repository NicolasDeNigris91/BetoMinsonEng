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
  type EventoTipo,
} from "@/db/schema";
import {
  evaluatePrazo,
  formatDate,
  formatDateTime,
  type DateFormat,
} from "@/lib/format";
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
  id: string;
  achadoId: string;
  tipo: EventoTipo;
  createdAt: Date;
  categoria: Categoria;
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

type LinhaAudit = {
  achadoId: string;
  categoria: Categoria;
  left: EventoView | null;
  right: EventoView | null;
};

const TIPO_LABEL: Record<EventoTipo, string> = {
  criado: "achado criado",
  resolvido: "resolvido",
  persiste: "persiste",
  nota: "anotação",
};

const TIPO_COLOR: Record<EventoTipo, string> = {
  criado: "text-amber-700 dark:text-amber-300",
  resolvido: "text-emerald-700 dark:text-emerald-300",
  persiste: "text-amber-700 dark:text-amber-300",
  nota: "text-muted-foreground",
};

/**
 * Agrupa eventos de uma vistoria por achadoId: criado/persiste/nota a
 * esquerda, resolvido a direita. Cada achado ocupa uma linha so. Preserva
 * ordem cronologica (Map preserva ordem de insercao).
 */
function pairEventosPorAchado(eventos: EventoView[]): LinhaAudit[] {
  const map = new Map<string, LinhaAudit>();
  for (const ev of eventos) {
    const entry = map.get(ev.achadoId) ?? {
      achadoId: ev.achadoId,
      categoria: ev.categoria,
      left: null,
      right: null,
    };
    if (ev.tipo === "resolvido") {
      entry.right = ev;
    } else if (!entry.left) {
      entry.left = ev;
    }
    map.set(ev.achadoId, entry);
  }
  return Array.from(map.values());
}

function EventoLine({
  ev,
  categoria,
  autor,
  dateFmt,
}: {
  ev: EventoView | null;
  categoria: Categoria;
  autor: string | null;
  dateFmt: DateFormat;
}) {
  if (!ev) {
    return (
      <span className="hidden font-mono text-[11px] text-muted-foreground/40 md:inline">
        —
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 font-mono text-[11px]">
      <span
        aria-hidden
        className={cn(
          "inline-block size-1.5 rounded-full",
          CATEGORIA_DOT[categoria],
        )}
      />
      <span className="text-foreground/80">
        {CATEGORIA_LABELS[categoria].toLowerCase()}
      </span>
      <span className={cn("font-semibold", TIPO_COLOR[ev.tipo])}>
        {TIPO_LABEL[ev.tipo]}
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums text-muted-foreground">
        {formatDateTime(ev.createdAt, dateFmt)}
      </span>
      {autor ? (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{autor}</span>
        </>
      ) : null}
    </span>
  );
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
    chipRows,
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
    // Achados distintos por (vistoria, categoria) que tem evento nao-resolvido
    // naquela vistoria. Alimenta os chips no card de cada vistoria.
    db
      .select({
        vistoriaId: achadoEventos.vistoriaId,
        categoria: achados.categoria,
        n: sql<number>`count(distinct ${achados.id})::int`,
      })
      .from(achadoEventos)
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
      .where(
        and(
          eq(vistorias.unidadeId, uid),
          sql`${achadoEventos.tipo} <> 'resolvido'`,
        ),
      )
      .groupBy(achadoEventos.vistoriaId, achados.categoria),
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
    // Eventos de todas as vistorias da unidade — alimenta o audit log
    // inline no card e tambem o estado "ja marcado" no dialog de pendencias.
    db
      .select({
        id: achadoEventos.id,
        vistoriaId: achadoEventos.vistoriaId,
        achadoId: achadoEventos.achadoId,
        tipo: achadoEventos.tipo,
        createdAt: achadoEventos.createdAt,
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

  // (vistoriaId -> Map<categoria, count>) — lookup O(1) na hora de renderizar.
  const chipsByVistoria = new Map<string, Map<Categoria, number>>();
  for (const row of chipRows) {
    let inner = chipsByVistoria.get(row.vistoriaId);
    if (!inner) {
      inner = new Map();
      chipsByVistoria.set(row.vistoriaId, inner);
    }
    inner.set(row.categoria, Number(row.n));
  }

  // (vistoriaId -> EventoView[]) na ordem cronologica, ja filtrada pelo
  // estado do achado correspondente.
  const eventosByVistoria = new Map<string, EventoView[]>();
  for (const row of eventosRows) {
    if (!achadosFiltradosIds.has(row.achadoId)) continue;
    const arr = eventosByVistoria.get(row.vistoriaId) ?? [];
    arr.push(row);
    eventosByVistoria.set(row.vistoriaId, arr);
  }

  // Ordem fixa do enum pra chips ficarem consistentes entre vistorias.
  const ORDEM_CATEGORIA: Categoria[] = [
    "ELE",
    "HID",
    "HVAC",
    "PISCINA",
    "ASP",
    "SIS",
  ];
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
              const counts = chipsByVistoria.get(v.id);
              const eventos = eventosByVistoria.get(v.id) ?? [];
              const linhasAudit = pairEventosPorAchado(eventos);
              const href = `/empreendimentos/${id}/unidades/${unidade.id}/vistorias/${v.id}`;

              return (
                <div
                  key={v.id}
                  className="relative overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring"
                >
                  <div
                    aria-hidden
                    className={`absolute top-0 bottom-0 left-0 z-10 w-[3px] ${VISTORIA_STATUS_STRIPE[v.status]}`}
                  />

                  {/* Link absoluto cobre o card todo, mas fica abaixo dos
                      botoes (z-0). Conteudo interno tem pointer-events-none
                      pra nao bloquear o clique do link. */}
                  <Link
                    href={href}
                    className="absolute inset-0 z-0 rounded-lg focus:outline-none"
                    aria-label={`Abrir vistoria de ${formatDate(v.data, dateFmt)}`}
                  />

                  <div className="pointer-events-none relative z-[1]">
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

                    {categoriasPresentes.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border/70 px-5 py-2">
                        {categoriasPresentes.map((cat) => {
                          const n = counts?.get(cat) ?? 0;
                          const label = CATEGORIA_LABELS[cat].toLowerCase();
                          return (
                            <span
                              key={cat}
                              className={`font-mono text-[10px] tracking-[0.06em] ${
                                n > 0
                                  ? "text-amber-700 dark:text-amber-300"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {label}{" "}
                              <span className="tabular-nums">
                                {n > 0 ? n : "ok"}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}

                    {linhasAudit.length > 0 ? (
                      <ul className="divide-y divide-dashed divide-border/70 border-t border-dashed border-border/70 bg-muted/30">
                        {linhasAudit.map((row) => (
                          <li
                            key={row.achadoId}
                            className="grid grid-cols-1 gap-x-6 gap-y-1 px-5 py-2 md:grid-cols-2"
                          >
                            <EventoLine
                              ev={row.left}
                              categoria={row.categoria}
                              autor={v.vistoriadorNome}
                              dateFmt={dateFmt}
                            />
                            <EventoLine
                              ev={row.right}
                              categoria={row.categoria}
                              autor={v.vistoriadorNome}
                              dateFmt={dateFmt}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {/* Acoes do canto superior direito — sibling do Link, z-10 */}
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
