import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, and, asc } from "drizzle-orm";
import { Plus, ClipboardList } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  escopoAchados,
  escopos,
  unidades,
  CATEGORIA_LABELS,
  type Categoria,
} from "@/db/schema";
import { parseUuidOrNotFound } from "@/lib/route-params";
import { getDateFormat } from "@/lib/date-format-server";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_STRIPE_BORDER,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { PrazoBadge } from "@/components/prazo-badge";
import { EscopoActionsBar } from "./escopo-actions-bar";
import { RemoverAchadoButton } from "./remover-achado-button";
import { AdicionarAchadosDialog } from "./adicionar-achados-dialog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ escopoId: string }>;
}): Promise<Metadata> {
  const { escopoId: rawId } = await params;
  if (!rawId) return { title: "Escopo" };
  try {
    const escopoId = parseUuidOrNotFound(rawId);
    const [row] = await db
      .select({ nome: escopos.nome })
      .from(escopos)
      .where(eq(escopos.id, escopoId))
      .limit(1);
    return { title: row?.nome ? `Escopo · ${row.nome}` : "Escopo" };
  } catch {
    return { title: "Escopo" };
  }
}

export default async function EscopoDetailPage({
  params,
}: {
  params: Promise<{ id: string; escopoId: string }>;
}) {
  const { id: rawEmpId, escopoId: rawEscopoId } = await params;
  const empreendimentoId = parseUuidOrNotFound(rawEmpId);
  const escopoId = parseUuidOrNotFound(rawEscopoId);
  const dateFmt = await getDateFormat();

  const [[emp], [escopo], itens, candidatosRaw] = await Promise.all([
    db
      .select()
      .from(empreendimentos)
      .where(eq(empreendimentos.id, empreendimentoId))
      .limit(1),
    db
      .select()
      .from(escopos)
      .where(
        and(
          eq(escopos.id, escopoId),
          eq(escopos.empreendimentoId, empreendimentoId),
        ),
      )
      .limit(1),
    db
      .select({
        achadoId: achados.id,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        status: achados.status,
        prazoEm: achados.prazoEm,
        unidadeId: unidades.id,
        unidadeNome: unidades.nome,
        unidadeOrdem: unidades.ordem,
        ordemNoEscopo: escopoAchados.ordem,
        adicionadoEm: escopoAchados.adicionadoEm,
      })
      .from(escopoAchados)
      .innerJoin(achados, eq(achados.id, escopoAchados.achadoId))
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(escopoAchados.escopoId, escopoId))
      .orderBy(asc(unidades.ordem), asc(unidades.nome), asc(escopoAchados.ordem)),
    // Candidatos pro dialog "Adicionar achados" — todos os achados em aberto
    // do empreendimento, com info da unidade. Carregar tudo aqui (em vez de
    // lazy load no dialog) e simples; ate ~300 achados a transferencia e
    // aceitavel. Evoluir pra route handler quando der sinal de lentidao.
    db
      .select({
        achadoId: achados.id,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        status: achados.status,
        prazoEm: achados.prazoEm,
        unidadeId: unidades.id,
        unidadeNome: unidades.nome,
        unidadeOrdem: unidades.ordem,
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(
        and(
          eq(unidades.empreendimentoId, empreendimentoId),
          eq(achados.status, "aberto"),
        ),
      )
      .orderBy(asc(unidades.ordem), asc(unidades.nome), asc(achados.categoria)),
  ]);

  if (!emp || !escopo) notFound();

  // Agrupar por unidade pra render.
  type ItemRow = (typeof itens)[number];
  const grupos = new Map<
    string,
    { unidadeId: string; unidadeNome: string; itens: ItemRow[] }
  >();
  for (const it of itens) {
    const g = grupos.get(it.unidadeId);
    if (g) {
      g.itens.push(it);
    } else {
      grupos.set(it.unidadeId, {
        unidadeId: it.unidadeId,
        unidadeNome: it.unidadeNome,
        itens: [it],
      });
    }
  }
  const grupoArray = Array.from(grupos.values());
  const nAchados = itens.length;
  const nUnidades = grupoArray.length;

  // Achados ja no escopo — passa pro dialog pra marcar quais ja foram adicionados.
  const achadoIdsNoEscopo = new Set(itens.map((i) => i.achadoId));

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${emp.id}` },
          { label: "Escopos", href: `/empreendimentos/${emp.id}/escopos` },
          { label: escopo.nome },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            {escopo.nome}
          </h1>
          {escopo.descricao ? (
            <p className="mt-1 text-sm whitespace-pre-line text-foreground/80">
              {escopo.descricao}
            </p>
          ) : null}
          <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
            <span className="tabular-nums text-foreground">
              {String(nAchados).padStart(2, "0")}
            </span>{" "}
            {nAchados === 1 ? "achado" : "achados"}
            {nUnidades > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="tabular-nums text-foreground">
                  {String(nUnidades).padStart(2, "0")}
                </span>{" "}
                {nUnidades === 1 ? "unidade" : "unidades"}
              </>
            ) : null}{" "}
            · criado em{" "}
            <span className="tabular-nums">
              {formatDate(escopo.createdAt, dateFmt)}
            </span>
            {escopo.updatedAt.getTime() !== escopo.createdAt.getTime() ? (
              <>
                {" "}
                · atualizado em{" "}
                <span className="tabular-nums">
                  {formatDateTime(escopo.updatedAt, dateFmt)}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <EscopoActionsBar escopo={escopo} nAchados={nAchados} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Achados no escopo
          </h2>
          <AdicionarAchadosDialog
            escopoId={escopo.id}
            empreendimentoId={emp.id}
            jaNoEscopo={Array.from(achadoIdsNoEscopo)}
            candidatos={candidatosRaw}
          />
        </div>

        {nAchados === 0 ? (
          <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
            <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center">
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                <ClipboardList
                  className="size-6 text-muted-foreground/60"
                  aria-hidden
                />
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Escopo vazio
              </p>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Adicione achados de qualquer unidade deste empreendimento.
              </p>
              <AdicionarAchadosDialog
                escopoId={escopo.id}
                empreendimentoId={emp.id}
                jaNoEscopo={[]}
                candidatos={candidatosRaw}
                triggerLabel="Adicionar achados"
                primary
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {grupoArray.map((g) => (
              <div
                key={g.unidadeId}
                className="overflow-hidden rounded-lg border bg-card"
              >
                <div className="border-b border-dashed border-border bg-muted/30 px-4 py-2">
                  <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                    {g.unidadeNome} ·{" "}
                    <span className="tabular-nums">
                      {String(g.itens.length).padStart(2, "0")}
                    </span>{" "}
                    {g.itens.length === 1 ? "achado" : "achados"}
                  </p>
                </div>
                <div className="divide-y">
                  {g.itens.map((it) => {
                    const cat = it.categoria as Categoria;
                    return (
                      <div
                        key={it.achadoId}
                        className={cn(
                          "flex items-start justify-between gap-3 p-3",
                          CATEGORIA_STRIPE_BORDER[cat],
                          "border-l-4",
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-mono text-xs",
                                CATEGORIA_BADGE_CLASS[cat],
                              )}
                            >
                              {CATEGORIA_LABELS[cat]}
                            </Badge>
                            {it.local ? (
                              <span className="text-sm font-medium">
                                {it.local}
                              </span>
                            ) : null}
                            <PrazoBadge
                              prazoEm={it.prazoEm}
                              resolvido={it.status === "resolvido"}
                            />
                            {it.status === "resolvido" ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                              >
                                resolvido
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-sm whitespace-pre-line">
                            {it.descricao}
                          </p>
                        </div>
                        <RemoverAchadoButton
                          escopoId={escopo.id}
                          achadoId={it.achadoId}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
