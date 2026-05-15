import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { db } from "@/db";
import {
  empreendimentos,
  unidades,
  vistorias,
  achados,
  achadoEventos,
  CATEGORIA_LABELS,
  type Categoria,
} from "@/db/schema";
import { formatDateBR } from "@/lib/format";
import {
  VISTORIA_STATUS_BADGE,
  VISTORIA_STATUS_STRIPE,
} from "@/lib/category-styles";
import { UnidadeFormDialog } from "../../unidade-form";
import { deleteUnidadeAction } from "../../actions";
import { NovaVistoriaDialog } from "./nova-vistoria-dialog";

export const dynamic = "force-dynamic";

export default async function UnidadeDetailPage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>;
}) {
  const { id, uid } = await params;

  const [
    [unidade],
    [emp],
    vistoriasList,
    [achadosCounts],
    chipRows,
    categoriasPresentesRows,
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
    // Categorias que aparecem em pelo menos um achado da unidade.
    db
      .selectDistinct({ categoria: achados.categoria })
      .from(achados)
      .where(eq(achados.unidadeId, uid)),
  ]);

  if (!unidade || !emp) notFound();

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

  // Ordem fixa do enum pra chips ficarem consistentes entre vistorias.
  const ORDEM_CATEGORIA: Categoria[] = [
    "ELE",
    "HID",
    "HVAC",
    "PISCINA",
    "ASP",
    "SIS",
  ];
  const setPresente = new Set(categoriasPresentesRows.map((r) => r.categoria));
  const categoriasNaUnidade = ORDEM_CATEGORIA.filter((c) => setPresente.has(c));

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${id}` },
          { label: unidade.nome },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            {unidade.nome}
          </h1>
          {unidade.observacoes ? (
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
              {unidade.observacoes}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <UnidadeFormDialog
            empreendimentoId={id}
            unidade={unidade}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 size-4" />
                Editar
              </Button>
            }
          />
          <ConfirmDialog
            title="Excluir unidade?"
            description="Todas as vistorias, achados e fotos desta unidade serão removidos."
            confirmLabel="Excluir"
            destructive
            onConfirm={deleteUnidadeAction.bind(null, unidade.id)}
            trigger={
              <Button variant="ghost" size="sm" aria-label="Excluir unidade">
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Vistorias" value={vistoriasList.length} />
        <StatCard
          label="Em aberto"
          value={Number(achadosCounts?.abertos ?? 0)}
          accent
        />
        <StatCard
          label="Resolvidos"
          value={Number(achadosCounts?.resolvidos ?? 0)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Vistorias
          </h2>
          <NovaVistoriaDialog
            unidadeId={unidade.id}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-4" />
                Nova vistoria
              </Button>
            }
          />
        </div>

        {vistoriasList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma vistoria registrada nesta unidade.
              </p>
              <NovaVistoriaDialog
                unidadeId={unidade.id}
                trigger={
                  <Button size="sm" className="mt-3">
                    <Plus className="mr-1.5 size-4" />
                    Criar primeira vistoria
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {vistoriasList.map((v) => {
              const counts = chipsByVistoria.get(v.id);
              return (
                <Link
                  key={v.id}
                  href={`/empreendimentos/${id}/unidades/${unidade.id}/vistorias/${v.id}`}
                  className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40">
                    <div
                      aria-hidden
                      className={`absolute top-0 bottom-0 left-0 w-[3px] ${VISTORIA_STATUS_STRIPE[v.status]}`}
                    />
                    <div className="flex items-center justify-between gap-3 px-5 py-4">
                      <div className="space-y-0.5">
                        <p className="text-base font-semibold text-foreground">
                          Vistoria de{" "}
                          <span className="font-tech">
                            {formatDateBR(v.data)}
                          </span>
                        </p>
                        {v.vistoriadorNome ? (
                          <p className="text-xs text-muted-foreground">
                            {v.vistoriadorNome}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-sm border px-1.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] uppercase ${VISTORIA_STATUS_BADGE[v.status].className}`}
                      >
                        {VISTORIA_STATUS_BADGE[v.status].label}
                      </span>
                    </div>
                    {categoriasNaUnidade.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border/70 px-5 py-2">
                        {categoriasNaUnidade.map((cat) => {
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
