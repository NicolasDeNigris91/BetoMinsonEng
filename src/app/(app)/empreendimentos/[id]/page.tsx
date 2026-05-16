import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc, count, sql } from "drizzle-orm";
import { FileText, Home, Pencil, Plus, Trash2 } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { db } from "@/db";
import { achados, empreendimentos, unidades, vistorias } from "@/db/schema";
import { formatDateBR } from "@/lib/format";
import {
  ACTIVITY_STRIPE,
  activityStatus,
} from "@/lib/category-styles";
import { EmpreendimentoFormDialog } from "../empreendimento-form";
import { deleteEmpreendimentoAction } from "../actions";
import { UnidadeFormDialog } from "./unidade-form";
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

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            {emp.nome}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {emp.cliente ? <span>Cliente: {emp.cliente}</span> : null}
            {emp.endereco ? <span>{emp.endereco}</span> : null}
          </div>
          {emp.observacoes ? (
            <p className="mt-2 text-sm whitespace-pre-line">{emp.observacoes}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
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
          <EmpreendimentoFormDialog
            empreendimento={emp}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 size-4" />
                Editar
              </Button>
            }
          />
          <ConfirmDialog
            title="Excluir empreendimento?"
            description="Todos os dados (unidades, vistorias, achados, fotos) serão removidos permanentemente."
            confirmLabel="Excluir tudo"
            destructive
            onConfirm={deleteEmpreendimentoAction.bind(null, emp.id)}
            trigger={
              <Button variant="ghost" size="sm" aria-label="Excluir empreendimento">
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Unidades
          </h2>
          <UnidadeFormDialog
            empreendimentoId={emp.id}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-4" />
                Nova unidade
              </Button>
            }
          />
        </div>

        {lista.length === 0 ? (
          <EmptyState
            icon={Home}
            eyebrow="Sem unidades cadastradas"
            description="Adicione a primeira unidade pra começar a registrar vistorias."
            action={
              <UnidadeFormDialog
                empreendimentoId={emp.id}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" />
                    Adicionar unidade
                  </Button>
                }
              />
            }
          />
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
