import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, and, count, asc, sql } from "drizzle-orm";
import { CheckCircle2, ClipboardList, History, Pencil, Plus, Trash2 } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
  CATEGORIA_LABELS,
  type Categoria,
  type EventoTipo,
} from "@/db/schema";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import {
  CATEGORIA_DOT,
  VISTORIA_STATUS_BADGE,
  VISTORIA_STATUS_STRIPE,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { UnidadeFormDialog } from "../../unidade-form";
import { deleteUnidadeAction } from "../../actions";
import { NovaVistoriaDialog } from "./nova-vistoria-dialog";

export const dynamic = "force-dynamic";

type EventoView = {
  id: string;
  achadoId: string;
  tipo: EventoTipo;
  createdAt: Date;
  categoria: Categoria;
};

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
}: {
  ev: EventoView | null;
  categoria: Categoria;
  autor: string | null;
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
        {formatDateTimeBR(ev.createdAt)}
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
    // Categorias que aparecem em pelo menos um achado da unidade.
    db
      .selectDistinct({ categoria: achados.categoria })
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

  // (vistoriaId -> EventoView[]) na ordem cronologica.
  const eventosByVistoria = new Map<string, EventoView[]>();
  for (const row of eventosRows) {
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
  const setPresente = new Set(categoriasPresentesRows.map((r) => r.categoria));
  const categoriasNaUnidade = ORDEM_CATEGORIA.filter((c) => setPresente.has(c));

  // Pendencias globais da unidade — alimenta o botao "Resolver pendencias"
  // no header. Como a resolucao agora e retroativa (grava na vistoria de
  // origem), nao precisamos pre-carregar estado de marcacao — todos os
  // achados em aberto sao pendencias com alreadyResolved=false.
  const pendenciasGlobais: PendenciaView[] = achadosAbertosRows.map((a) => ({
    id: a.id,
    categoria: a.categoria,
    local: a.local,
    descricao: a.descricao,
    prazoEm: a.prazoEm,
  }));

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Vistorias
          </h2>
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
        </div>

        {vistoriasList.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            eyebrow="Sem vistorias registradas"
            description="Crie a primeira vistoria pra começar a registrar achados."
            action={
              <NovaVistoriaDialog
                unidadeId={unidade.id}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" />
                    Criar primeira vistoria
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="space-y-2">
            {vistoriasList.map((v) => {
              const counts = chipsByVistoria.get(v.id);
              const eventos = eventosByVistoria.get(v.id) ?? [];
              const linhasAudit = pairEventosPorAchado(eventos);
              const href = `/empreendimentos/${id}/unidades/${unidade.id}/vistorias/${v.id}`;

              return (
                <Link
                  key={v.id}
                  href={href}
                  className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40">
                    <div
                      aria-hidden
                      className={`absolute top-0 bottom-0 left-0 w-[3px] ${VISTORIA_STATUS_STRIPE[v.status]}`}
                    />

                    <div className="flex items-center justify-between gap-3 px-5 py-4 pr-32">
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
                            />
                            <EventoLine
                              ev={row.right}
                              categoria={row.categoria}
                              autor={v.vistoriadorNome}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <span
                      className={`absolute top-4 right-5 rounded-sm border px-1.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] uppercase ${VISTORIA_STATUS_BADGE[v.status].className}`}
                    >
                      {VISTORIA_STATUS_BADGE[v.status].label}
                    </span>
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
