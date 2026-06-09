import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, and, asc, desc, inArray, isNull } from "drizzle-orm";
import { CheckCircle2, ClipboardList, MessageSquare } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  escopoAchados,
  escopoShareTokens,
  escopos,
  fotos,
  unidades,
  vistorias,
  CATEGORIA_LABELS,
  type Categoria,
} from "@/db/schema";
import { env } from "@/lib/env";
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
import { EscopoSharePanel } from "./share-panel";

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

  const [[emp], [escopo], itens, candidatosRaw, shareTokens] = await Promise.all([
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
    db
      .select({
        id: escopoShareTokens.id,
        token: escopoShareTokens.token,
        criadoEm: escopoShareTokens.criadoEm,
      })
      .from(escopoShareTokens)
      .where(
        and(
          eq(escopoShareTokens.escopoId, escopoId),
          isNull(escopoShareTokens.revogadoEm),
        ),
      )
      .orderBy(asc(escopoShareTokens.criadoEm)),
  ]);

  if (!emp || !escopo) notFound();

  // Eventos registrados pelo profissional via este escopo (resolvido +
  // persiste, com fotos e notas). Carregamento separado pra nao inflar a
  // query principal de achados — so dispara se ha achados no escopo.
  const achadoIdsArr = itens.map((i) => i.achadoId);
  const eventosViaEscopo =
    achadoIdsArr.length > 0
      ? await db.query.achadoEventos.findMany({
          where: and(
            eq(achadoEventos.escopoOrigemId, escopoId),
            inArray(achadoEventos.achadoId, achadoIdsArr),
          ),
          with: {
            fotos: { orderBy: asc(fotos.ordem) },
          },
        })
      : [];
  const eventoPorAchado = new Map<string, (typeof eventosViaEscopo)[number]>();
  for (const ev of eventosViaEscopo) {
    eventoPorAchado.set(ev.achadoId, ev);
  }

  // Pra cada achado resolvido por outro contexto (admin direto ou outro
  // escopo), descobrir QUEM resolveu pra exibir nome em vez de "outro
  // contexto" generico. Pega o evento 'resolvido' mais recente — eventos
  // anteriores ficam registrados no historico, mas o que vale pro estado
  // atual e o ultimo.
  const resolucoes =
    achadoIdsArr.length > 0
      ? await db
          .select({
            achadoId: achadoEventos.achadoId,
            escopoNome: escopos.nome,
            vistoriadorNome: vistorias.vistoriadorNome,
            createdAt: achadoEventos.createdAt,
          })
          .from(achadoEventos)
          .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
          .leftJoin(escopos, eq(escopos.id, achadoEventos.escopoOrigemId))
          .where(
            and(
              eq(achadoEventos.tipo, "resolvido"),
              inArray(achadoEventos.achadoId, achadoIdsArr),
            ),
          )
          .orderBy(desc(achadoEventos.createdAt))
      : [];
  const resolvedorPorAchado = new Map<
    string,
    { por: string; createdAt: Date }
  >();
  for (const r of resolucoes) {
    if (resolvedorPorAchado.has(r.achadoId)) continue; // ja pegou o mais recente
    const por =
      r.escopoNome ??
      (r.vistoriadorNome
        ? `${r.vistoriadorNome} (vistoria)`
        : "vistoria de inspecao");
    resolvedorPorAchado.set(r.achadoId, { por, createdAt: r.createdAt });
  }

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
            {escopo.prazoEm ? (
              <>
                {" · "}
                <PrazoBadge
                  prazoEm={escopo.prazoEm}
                  className="align-middle"
                />
              </>
            ) : null}
          </p>
        </div>
        <EscopoActionsBar escopo={escopo} nAchados={nAchados} />
      </div>

      {nAchados > 0 ? (
        <EscopoSharePanel
          escopoId={escopo.id}
          baseUrl={env.BASE_URL}
          tokens={shareTokens.map((t) => ({
            id: t.id,
            token: t.token,
            criadoEm: t.criadoEm.toISOString(),
          }))}
          dateFmt={dateFmt}
        />
      ) : null}

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
                    const ev = eventoPorAchado.get(it.achadoId);
                    // Decide o badge de estado considerando 3 cenarios:
                    //   1. Profissional deste escopo agiu (resolvido ou persiste)
                    //   2. Achado resolvido, mas por outro contexto (admin / outro escopo)
                    //   3. Pendente (status aberto, sem evento neste escopo)
                    const resolvidoEmOutro =
                      it.status === "resolvido" && ev?.tipo !== "resolvido";
                    const resolvedorOutro = resolvidoEmOutro
                      ? resolvedorPorAchado.get(it.achadoId)
                      : null;
                    return (
                      <div
                        key={it.achadoId}
                        className={cn(
                          "flex items-start justify-between gap-3 p-3",
                          CATEGORIA_STRIPE_BORDER[cat],
                          "border-l-4",
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-2">
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
                            {ev?.tipo === "resolvido" ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                              >
                                <CheckCircle2 className="mr-1 size-3" />
                                resolvido por {escopo.nome}
                              </Badge>
                            ) : ev?.tipo === "persiste" ? (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                              >
                                <MessageSquare className="mr-1 size-3" />
                                persiste — {escopo.nome}
                              </Badge>
                            ) : resolvidoEmOutro && resolvedorOutro ? (
                              <Badge
                                variant="outline"
                                className="border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              >
                                <CheckCircle2 className="mr-1 size-3" />
                                resolvido por {resolvedorOutro.por}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-sm whitespace-pre-line">
                            {it.descricao}
                          </p>

                          {ev ? (
                            <div className="mt-2 rounded-md border border-l-2 border-l-brand bg-brand/[0.03] p-2.5 space-y-2">
                              <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                                <span className="text-foreground font-semibold">
                                  {escopo.nome}
                                </span>{" "}
                                registrou em{" "}
                                <span className="text-foreground">
                                  {formatDateTime(ev.createdAt, dateFmt)}
                                </span>
                              </p>
                              {ev.notaExtra ? (
                                <p className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic whitespace-pre-line">
                                  “{ev.notaExtra}”
                                </p>
                              ) : null}
                              {ev.fotos.length > 0 ? (
                                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                  {ev.fotos.map((f) => (
                                    <a
                                      key={f.id}
                                      href={`/api/files/${f.arquivoPath}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block aspect-square overflow-hidden rounded border bg-muted hover:opacity-90"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={`/api/files/${f.thumbPath}`}
                                        alt={f.legenda ?? "Foto da execucao"}
                                        loading="lazy"
                                        decoding="async"
                                        className="h-full w-full object-cover"
                                      />
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
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
