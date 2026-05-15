import { and, desc, eq, count, isNotNull, lt, sql, inArray } from "drizzle-orm";
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

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

function emptyChips(): Record<Categoria, number> {
  return { ELE: 0, HID: 0, HVAC: 0, PISCINA: 0, ASP: 0, SIS: 0 };
}

export default async function EmpreendimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const pageParam = Number(sp.page ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const hojeISO = new Date().toISOString().slice(0, 10);

  // Stats globais pra linha executiva no header — independem da pagina
  // visivel, contam toda a base. 4 queries baratas em paralelo.
  const [
    [totalRow],
    lista,
    [totalUnidadesRow],
    [totalAbertosRow],
    [totalAtrasadosRow],
  ] = await Promise.all([
    db.select({ n: count() }).from(empreendimentos),
    db
      .select()
      .from(empreendimentos)
      .orderBy(desc(empreendimentos.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
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

  const total = Number(totalRow?.n ?? 0);
  const totalUnidades = Number(totalUnidadesRow?.n ?? 0);
  const totalAbertos = Number(totalAbertosRow?.n ?? 0);
  const totalAtrasados = Number(totalAtrasadosRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const empIds = lista.map((e) => e.id);

  // Agregados pra cada empreendimento da pagina visivel. Tudo em paralelo
  // pra reduzir round-trips no DB.
  const [
    unidadesRows,
    abertosRows,
    resolvidosRows,
    atrasadosRows,
    chipsRows,
    ultimaVistoriaRows,
    ultimoEventoRows,
  ] =
    empIds.length === 0
      ? [[], [], [], [], [], [], []]
      : await Promise.all([
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              n: count(),
            })
            .from(unidades)
            .where(inArray(unidades.empreendimentoId, empIds))
            .groupBy(unidades.empreendimentoId),
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              n: count(),
            })
            .from(achados)
            .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
            .where(
              and(
                eq(achados.status, "aberto"),
                inArray(unidades.empreendimentoId, empIds),
              ),
            )
            .groupBy(unidades.empreendimentoId),
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              n: count(),
            })
            .from(achados)
            .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
            .where(
              and(
                eq(achados.status, "resolvido"),
                inArray(unidades.empreendimentoId, empIds),
              ),
            )
            .groupBy(unidades.empreendimentoId),
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              n: count(),
            })
            .from(achados)
            .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
            .where(
              and(
                eq(achados.status, "aberto"),
                isNotNull(achados.prazoEm),
                lt(achados.prazoEm, hojeISO),
                inArray(unidades.empreendimentoId, empIds),
              ),
            )
            .groupBy(unidades.empreendimentoId),
          // Distribuicao de abertos por (empreendimento, categoria).
          // Alimenta os chips coloridos no card.
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              categoria: achados.categoria,
              n: count(),
            })
            .from(achados)
            .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
            .where(
              and(
                eq(achados.status, "aberto"),
                inArray(unidades.empreendimentoId, empIds),
              ),
            )
            .groupBy(unidades.empreendimentoId, achados.categoria),
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              ts: sql<string>`max(${vistorias.createdAt})`,
            })
            .from(vistorias)
            .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
            .where(inArray(unidades.empreendimentoId, empIds))
            .groupBy(unidades.empreendimentoId),
          // max(achado_eventos.created_at) por empreendimento — pra capturar
          // atividade que aconteceu DEPOIS da vistoria (ex: marcacao retroativa
          // de resolvido). Junto com ultimaVistoria, da o snapshot mais
          // fidedigno do "ativo ha quanto tempo".
          db
            .select({
              empreendimentoId: unidades.empreendimentoId,
              ts: sql<string>`max(${achadoEventos.createdAt})`,
            })
            .from(achadoEventos)
            .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
            .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
            .where(inArray(unidades.empreendimentoId, empIds))
            .groupBy(unidades.empreendimentoId),
        ]);

  // Indexa todos os agregados por empreendimentoId pra lookup O(1) na
  // construcao do view model.
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

  // (empreendimentoId, categoria) -> count.
  const chipsPor = new Map<string, Record<Categoria, number>>();
  for (const row of chipsRows) {
    const existing = chipsPor.get(row.empreendimentoId) ?? emptyChips();
    existing[row.categoria] = Number(row.n);
    chipsPor.set(row.empreendimentoId, existing);
  }

  // Pega a atividade mais recente entre vistoria criada e ultimo evento.
  function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
    if (!a) return b ?? null;
    if (!b) return a;
    return a > b ? a : b;
  }

  const views: EmpreendimentoCardView[] = lista.map((emp) => ({
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

  return (
    <div className="space-y-6">
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

      {lista.length === 0 ? (
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
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {views.map((view) => (
              <EmpreendimentoCard key={view.id} view={view} />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            hrefForPage={(p) =>
              p === 1 ? "/empreendimentos" : `/empreendimentos?page=${p}`
            }
          />
        </>
      )}
    </div>
  );
}
