import Link from "next/link";
import { and, desc, eq, count, isNotNull, lt, sql } from "drizzle-orm";
import { Plus, Building2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  unidades,
  vistorias,
  type Categoria,
} from "@/db/schema";
import { EmpreendimentoFormDialog } from "./empreendimento-form";
import {
  EmpreendimentoCard,
  type EmpreendimentoCardView,
} from "./empreendimento-card";
import {
  EmpreendimentosToolbar,
  type SortKey,
} from "./empreendimentos-toolbar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
const SORT_KEYS: SortKey[] = [
  "ativos",
  "atrasados",
  "recentes",
  "alfabetico",
  "sem-vistorias",
];

function emptyChips(): Record<Categoria, number> {
  return { ELE: 0, HID: 0, HVAC: 0, PISCINA: 0, ASP: 0, SIS: 0 };
}

function parseSortKey(s: string | undefined): SortKey {
  if (s && (SORT_KEYS as string[]).includes(s)) return s as SortKey;
  return "ativos";
}

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

export default async function EmpreendimentosPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    hideEmpty?: string;
  }>;
}) {
  const sp = await searchParams;
  const pageParam = Number(sp.page ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const q = (sp.q ?? "").trim();
  const sort = parseSortKey(sp.sort);
  const hideEmpty = sp.hideEmpty === "1";
  const hojeISO = new Date().toISOString().slice(0, 10);

  // Fetch tudo de uma vez. Pra escala atual (<100 empreendimentos) e melhor
  // que paginar no DB porque filtros/sort dependem de agregados — fazer no
  // DB exigiria joins complexos com subqueries. Em memoria fica direto.
  const [
    todosEmpreendimentos,
    unidadesRows,
    abertosRows,
    resolvidosRows,
    atrasadosRows,
    chipsRows,
    ultimaVistoriaRows,
    ultimoEventoRows,
    [totalUnidadesRow],
    [totalAbertosRow],
    [totalAtrasadosRow],
  ] = await Promise.all([
    db
      .select()
      .from(empreendimentos)
      .orderBy(desc(empreendimentos.createdAt)),
    db
      .select({ empreendimentoId: unidades.empreendimentoId, n: count() })
      .from(unidades)
      .groupBy(unidades.empreendimentoId),
    db
      .select({ empreendimentoId: unidades.empreendimentoId, n: count() })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(achados.status, "aberto"))
      .groupBy(unidades.empreendimentoId),
    db
      .select({ empreendimentoId: unidades.empreendimentoId, n: count() })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(achados.status, "resolvido"))
      .groupBy(unidades.empreendimentoId),
    db
      .select({ empreendimentoId: unidades.empreendimentoId, n: count() })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(
        and(
          eq(achados.status, "aberto"),
          isNotNull(achados.prazoEm),
          lt(achados.prazoEm, hojeISO),
        ),
      )
      .groupBy(unidades.empreendimentoId),
    db
      .select({
        empreendimentoId: unidades.empreendimentoId,
        categoria: achados.categoria,
        n: count(),
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(achados.status, "aberto"))
      .groupBy(unidades.empreendimentoId, achados.categoria),
    db
      .select({
        empreendimentoId: unidades.empreendimentoId,
        ts: sql<string>`max(${vistorias.createdAt})`,
      })
      .from(vistorias)
      .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
      .groupBy(unidades.empreendimentoId),
    db
      .select({
        empreendimentoId: unidades.empreendimentoId,
        ts: sql<string>`max(${achadoEventos.createdAt})`,
      })
      .from(achadoEventos)
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .groupBy(unidades.empreendimentoId),
    db.select({ n: count() }).from(unidades),
    db
      .select({ n: count() })
      .from(achados)
      .where(eq(achados.status, "aberto")),
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
  ]);

  const total = todosEmpreendimentos.length;
  const totalUnidades = Number(totalUnidadesRow?.n ?? 0);
  const totalAbertos = Number(totalAbertosRow?.n ?? 0);
  const totalAtrasados = Number(totalAtrasadosRow?.n ?? 0);

  // Indexa todos os agregados por empreendimentoId.
  const unidadesPor = new Map(
    unidadesRows.map((r) => [r.empreendimentoId, Number(r.n)]),
  );
  const abertosPor = new Map(
    abertosRows.map((r) => [r.empreendimentoId, Number(r.n)]),
  );
  const resolvidosPor = new Map(
    resolvidosRows.map((r) => [r.empreendimentoId, Number(r.n)]),
  );
  const atrasadosPor = new Map(
    atrasadosRows.map((r) => [r.empreendimentoId, Number(r.n)]),
  );
  const ultimaVistoriaPor = new Map(
    ultimaVistoriaRows.map((r) => [r.empreendimentoId, r.ts]),
  );
  const ultimoEventoPor = new Map(
    ultimoEventoRows.map((r) => [r.empreendimentoId, r.ts]),
  );
  const chipsPor = new Map<string, Record<Categoria, number>>();
  for (const row of chipsRows) {
    const existing = chipsPor.get(row.empreendimentoId) ?? emptyChips();
    existing[row.categoria] = Number(row.n);
    chipsPor.set(row.empreendimentoId, existing);
  }

  // Constroi view models — um por empreendimento da base inteira.
  let views: EmpreendimentoCardView[] = todosEmpreendimentos.map((emp) => ({
    id: emp.id,
    nome: emp.nome,
    cliente: emp.cliente,
    endereco: emp.endereco,
    nUnidades: unidadesPor.get(emp.id) ?? 0,
    nAbertos: abertosPor.get(emp.id) ?? 0,
    nResolvidos: resolvidosPor.get(emp.id) ?? 0,
    nAtrasados: atrasadosPor.get(emp.id) ?? 0,
    abertosPorCategoria: chipsPor.get(emp.id) ?? emptyChips(),
    ultimaAtividadeISO: maxIso(
      ultimaVistoriaPor.get(emp.id),
      ultimoEventoPor.get(emp.id),
    ),
  }));

  // Filtro de texto: nome ou cliente. Lowercase comparison sem acento
  // simples (o user nao deve digitar com acento e a base pode ter ou nao).
  if (q.length > 0) {
    const needle = q.toLowerCase();
    views = views.filter((v) => {
      const nome = v.nome.toLowerCase();
      const cliente = (v.cliente ?? "").toLowerCase();
      return nome.includes(needle) || cliente.includes(needle);
    });
  }

  // Esconder sem atividade: sem unidades OU sem nenhuma vistoria.
  if (hideEmpty) {
    views = views.filter(
      (v) => v.nUnidades > 0 && v.ultimaAtividadeISO !== null,
    );
  }

  // Ordenacao em memoria sobre o view model — usa os mesmos campos que o
  // card renderiza, evitando dupla source-of-truth.
  views.sort((a, b) => sortCompare(a, b, sort));

  // Pagina o resultado filtrado/ordenado.
  const totalFiltrado = views.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;
  const pageViews = views.slice(offset, offset + PAGE_SIZE);

  const hasAnyFilter = q.length > 0 || hideEmpty || sort !== "ativos";

  // Mantem os params (exceto page) ao mudar de pagina.
  const buildPageHref = (p: number): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort !== "ativos") params.set("sort", sort);
    if (hideEmpty) params.set("hideEmpty", "1");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/empreendimentos${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
              Empreendimentos
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastre cada projeto e suas unidades.
            </p>
          </div>
          {total > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
              <span>
                <strong className="tabular-nums font-bold text-foreground">
                  {String(total).padStart(2, "0")}
                </strong>{" "}
                {total === 1 ? "empreendimento" : "empreendimentos"}
              </span>
              <span>
                <strong className="tabular-nums font-bold text-foreground">
                  {String(totalUnidades).padStart(2, "0")}
                </strong>{" "}
                {totalUnidades === 1 ? "unidade" : "unidades"}
              </span>
              <span>
                <strong className="tabular-nums font-bold text-foreground">
                  {String(totalAbertos).padStart(2, "0")}
                </strong>{" "}
                em aberto
              </span>
              {totalAtrasados > 0 ? (
                <span>
                  <strong className="tabular-nums font-bold text-red-700 dark:text-red-300">
                    {String(totalAtrasados).padStart(2, "0")}
                  </strong>{" "}
                  <span className="text-red-700 dark:text-red-300">
                    atrasados
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <EmpreendimentoFormDialog
          trigger={
            <Button>
              <Plus className="mr-1.5 size-4" />
              Novo
            </Button>
          }
        />
      </div>

      {total > 0 ? (
        <EmpreendimentosToolbar q={q} sort={sort} hideEmpty={hideEmpty} />
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={Building2}
          eyebrow="Nenhum empreendimento ainda"
          description="Cadastre seu primeiro projeto pra começar a registrar vistorias."
          action={
            <EmpreendimentoFormDialog
              trigger={
                <Button>
                  <Plus className="mr-1.5 size-4" />
                  Criar primeiro empreendimento
                </Button>
              }
            />
          }
        />
      ) : pageViews.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum empreendimento bate com{" "}
            {q ? <strong>&ldquo;{q}&rdquo;</strong> : "o filtro atual"}.
          </p>
          {hasAnyFilter ? (
            <Link
              href="/empreendimentos"
              className="mt-2 inline-block font-mono text-[11px] tracking-[0.06em] uppercase text-brand hover:underline"
            >
              Limpar filtros
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {hasAnyFilter ? (
            <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
              Mostrando{" "}
              <strong className="tabular-nums text-foreground">
                {totalFiltrado}
              </strong>{" "}
              de {total}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageViews.map((view) => (
              <EmpreendimentoCard key={view.id} view={view} />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} hrefForPage={buildPageHref} />
        </>
      )}
    </div>
  );
}

function sortCompare(
  a: EmpreendimentoCardView,
  b: EmpreendimentoCardView,
  sort: SortKey,
): number {
  switch (sort) {
    case "alfabetico":
      return a.nome.localeCompare(b.nome, "pt-BR");
    case "recentes":
      // Recentes = ordem default original (createdAt desc do query) ja
      // chegou ordenada. Sem campo createdAt no view model, usa
      // ultimaAtividadeISO como aproximacao razoavel.
      return cmpIsoDesc(a.ultimaAtividadeISO, b.ultimaAtividadeISO);
    case "atrasados":
      // Atrasados primeiro, depois ativos.
      if (a.nAtrasados !== b.nAtrasados) return b.nAtrasados - a.nAtrasados;
      return cmpIsoDesc(a.ultimaAtividadeISO, b.ultimaAtividadeISO);
    case "sem-vistorias":
      // Os COM vistorias na frente, sem vistorias no fim. Dentro de cada
      // grupo, mais ativos primeiro.
      const aHas = a.ultimaAtividadeISO !== null ? 1 : 0;
      const bHas = b.ultimaAtividadeISO !== null ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return cmpIsoDesc(a.ultimaAtividadeISO, b.ultimaAtividadeISO);
    case "ativos":
    default:
      return cmpIsoDesc(a.ultimaAtividadeISO, b.ultimaAtividadeISO);
  }
}

function cmpIsoDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a > b ? -1 : 1;
}
