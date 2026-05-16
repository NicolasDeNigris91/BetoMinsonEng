import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc, count, sql } from "drizzle-orm";
import { FileText, Plus, StickyNote } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { achados, empreendimentos, unidades, vistorias } from "@/db/schema";
import { formatDateBR } from "@/lib/format";
import {
  ACTIVITY_STRIPE,
  activityStatus,
} from "@/lib/category-styles";
import { UnidadeFormDialog } from "./unidade-form";
import { UnidadeQuickAdd } from "./unidade-quick-add";
import { HeaderActionsMenu } from "./header-actions-menu";
import { RelatorioEvolucaoDialog } from "./relatorio-evolucao-dialog";

export const dynamic = "force-dynamic";

export default async function EmpreendimentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [[emp], lista, vistoriasRows, abertosRows, ultimasRows] =
    await Promise.all([
      db
        .select()
        .from(empreendimentos)
        .where(eq(empreendimentos.id, id))
        .limit(1),
      db
        .select()
        .from(unidades)
        .where(eq(unidades.empreendimentoId, id))
        .orderBy(asc(unidades.ordem), asc(unidades.nome)),
      db
        .select({ unidadeId: vistorias.unidadeId, n: count() })
        .from(vistorias)
        .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
        .where(eq(unidades.empreendimentoId, id))
        .groupBy(vistorias.unidadeId),
      db
        .select({ unidadeId: achados.unidadeId, n: count() })
        .from(achados)
        .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
        .where(eq(unidades.empreendimentoId, id))
        .groupBy(achados.unidadeId),
      db
        .select({
          unidadeId: vistorias.unidadeId,
          data: sql<string>`max(${vistorias.data})`,
        })
        .from(vistorias)
        .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
        .where(eq(unidades.empreendimentoId, id))
        .groupBy(vistorias.unidadeId),
    ]);

  if (!emp) notFound();

  // achadosAbertos por unidade exige filtro adicional; reutiliza lista anterior
  // mas filtrando status='aberto' separadamente.
  const abertosOpenRows = await db
    .select({ unidadeId: achados.unidadeId, n: count() })
    .from(achados)
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(
      sql`${unidades.empreendimentoId} = ${id} AND ${achados.status} = 'aberto'`,
    )
    .groupBy(achados.unidadeId);

  const vistoriasPor = new Map(
    vistoriasRows.map((r) => [r.unidadeId, Number(r.n)]),
  );
  const abertosPor = new Map(
    abertosOpenRows.map((r) => [r.unidadeId, Number(r.n)]),
  );
  const totalAchadosPor = new Map(
    abertosRows.map((r) => [r.unidadeId, Number(r.n)]),
  );
  const ultimaPor = new Map(ultimasRows.map((r) => [r.unidadeId, r.data]));

  const totalAbertos = Array.from(abertosPor.values()).reduce(
    (s, n) => s + n,
    0,
  );
  const totalGeral = Array.from(totalAchadosPor.values()).reduce(
    (s, n) => s + n,
    0,
  );
  const totalResolvidos = totalGeral - totalAbertos;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            {emp.nome}
          </h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {emp.cliente ? (
              <>
                <dt className="self-center font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Cliente
                </dt>
                <dd className="text-foreground">{emp.cliente}</dd>
              </>
            ) : null}
            {emp.endereco ? (
              <>
                <dt className="self-center font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Endereço
                </dt>
                <dd className="text-foreground">{emp.endereco}</dd>
              </>
            ) : null}
            {emp.observacoes ? (
              <>
                <dt className="self-start pt-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <StickyNote className="size-3" />
                    Notas
                  </span>
                </dt>
                <dd className="rounded-md bg-muted/40 px-2.5 py-1.5 text-sm whitespace-pre-line text-foreground/90">
                  {emp.observacoes}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            title="PDF consolidado de todas as vistorias do empreendimento"
            render={
              <a
                href={`/api/pdf/consolidado/${emp.id}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileText className="mr-1.5 size-4" />
            Consolidado
          </Button>
          <RelatorioEvolucaoDialog empreendimentoId={emp.id} />
          <HeaderActionsMenu empreendimento={emp} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
              Unidades
            </h2>
            {lista.length > 0 ? (
              <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                <span className="tabular-nums text-foreground">
                  {String(lista.length).padStart(2, "0")}
                </span>{" "}
                {lista.length === 1 ? "unidade" : "unidades"} ·{" "}
                <span className="tabular-nums text-amber-700 dark:text-amber-300">
                  {String(totalAbertos).padStart(2, "0")}
                </span>{" "}
                abertos
                {totalResolvidos > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                      {String(totalResolvidos).padStart(2, "0")}
                    </span>{" "}
                    resolvidos
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          {/* CTA do topo so aparece quando ja existem unidades. Quando vazio,
              o quick-add inline e a unica acao primaria, sem duplicacao. */}
          {lista.length > 0 ? (
            <UnidadeFormDialog
              empreendimentoId={emp.id}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" />
                  Nova unidade
                </Button>
              }
            />
          ) : null}
        </div>

        {lista.length === 0 ? (
          <UnidadeQuickAdd empreendimentoId={emp.id} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((un) => {
              const nVistorias = vistoriasPor.get(un.id) ?? 0;
              const nAbertos = abertosPor.get(un.id) ?? 0;
              const totalAchados = totalAchadosPor.get(un.id) ?? 0;
              const ultima = ultimaPor.get(un.id);
              const status = activityStatus(nAbertos, nVistorias > 0, 5);
              return (
                <Link
                  key={un.id}
                  href={`/empreendimentos/${emp.id}/unidades/${un.id}`}
                  className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative h-full overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40">
                    <div
                      aria-hidden
                      className={`absolute top-0 bottom-0 left-0 w-[3px] ${ACTIVITY_STRIPE[status]}`}
                    />
                    <div className="space-y-1 px-5 py-4">
                      <p className="text-base font-semibold">{un.nome}</p>
                      {un.observacoes ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {un.observacoes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border/70 px-5 py-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                      <span>
                        <span className="tabular-nums text-foreground">
                          {String(nVistorias).padStart(2, "0")}
                        </span>{" "}
                        vistorias
                      </span>
                      <span
                        className={
                          nAbertos > 0
                            ? "text-amber-700 dark:text-amber-300"
                            : ""
                        }
                      >
                        <span className="tabular-nums">
                          {String(nAbertos).padStart(2, "0")}
                        </span>{" "}
                        abertos
                      </span>
                      {totalAchados - nAbertos > 0 ? (
                        <span>
                          <span className="tabular-nums">
                            {String(totalAchados - nAbertos).padStart(2, "0")}
                          </span>{" "}
                          resolv.
                        </span>
                      ) : null}
                      <span>
                        última{" "}
                        <span className="tabular-nums text-foreground">
                          {ultima ? formatDateBR(ultima) : "—"}
                        </span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
