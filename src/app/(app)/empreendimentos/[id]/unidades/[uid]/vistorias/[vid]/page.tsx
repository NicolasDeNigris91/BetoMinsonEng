import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, and, ne, asc, gt, desc, count, sql } from "drizzle-orm";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  shareTokens,
  unidades,
  vistorias,
} from "@/db/schema";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getDateFormat } from "@/lib/date-format-server";
import { isUuid, parseUuidOrNotFound } from "@/lib/route-params";
import { UploadInFlightProvider } from "@/lib/upload-in-flight";
import { VISTORIA_STATUS_BADGE } from "@/lib/category-styles";
import { AchadoChecklistRow } from "./achado-checklist-row";
import { AchadosSortableList } from "./achados-sortable-list";
import { AchadoFormDialog } from "./novo-achado-dialog";
import { MobileUploadButton } from "./mobile-upload-button";
import { NovoAchadoCard } from "./novo-achado-card";
import { ObservacoesField } from "./observacoes-field";
import { SharePanel } from "./share-panel";
import { VistoriaActionsBar } from "./vistoria-actions-bar";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uid: string; vid: string }>;
}): Promise<Metadata> {
  const { uid, vid } = await params;
  // Skip DB hit (e o cast UUID que estouraria) quando os params nao forem
  // UUID — a page que vem depois chama notFound() na mesma situacao.
  if (!isUuid(uid) || !isUuid(vid)) return { title: "Vistoria" };
  const [row] = await db
    .select({
      vistoriaData: vistorias.data,
      unidadeNome: unidades.nome,
    })
    .from(vistorias)
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .where(and(eq(vistorias.id, vid), eq(unidades.id, uid)))
    .limit(1);
  if (!row) return { title: "Vistoria" };
  const dateFmt = await getDateFormat();
  return {
    title: `${row.unidadeNome} — Vistoria ${formatDate(row.vistoriaData, dateFmt)}`,
  };
}

export default async function VistoriaPage({
  params,
}: {
  params: Promise<{ id: string; uid: string; vid: string }>;
}) {
  const { id: rawId, uid: rawUid, vid: rawVid } = await params;
  const id = parseUuidOrNotFound(rawId);
  const uid = parseUuidOrNotFound(rawUid);
  const vid = parseUuidOrNotFound(rawVid);
  const dateFmt = await getDateFormat();

  const [
    [vistoria],
    [unidade],
    [emp],
    checklist,
    eventosNestaVistoria,
    novosAchados,
    allActiveTokens,
    templatesFrequentes,
  ] = await Promise.all([
    db
      .select()
      .from(vistorias)
      .where(and(eq(vistorias.id, vid), eq(vistorias.unidadeId, uid)))
      .limit(1),
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
      .from(achados)
      .where(
        and(
          eq(achados.unidadeId, uid),
          eq(achados.status, "aberto"),
          ne(achados.vistoriaOrigemId, vid),
        ),
      )
      .orderBy(asc(achados.categoria), asc(achados.createdAt)),
    db.query.achadoEventos.findMany({
      where: eq(achadoEventos.vistoriaId, vid),
      with: {
        fotos: { orderBy: (f, { asc }) => asc(f.ordem) },
        achado: true,
      },
      orderBy: asc(achadoEventos.createdAt),
    }),
    db
      .select()
      .from(achados)
      .where(eq(achados.vistoriaOrigemId, vid))
      .orderBy(asc(achados.ordem), asc(achados.createdAt)),
    db
      .select()
      .from(shareTokens)
      .where(
        and(
          eq(shareTokens.vistoriaId, vid),
          gt(shareTokens.expiraEm, new Date()),
        ),
      )
      .orderBy(desc(shareTokens.criadoEm)),
    // Templates de achados frequentes — combinacoes (categoria, local,
    // descricao) que se repetem 2+ vezes no empreendimento. Alimenta o
    // painel "Templates frequentes" do dialog de novo achado.
    db
      .select({
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        uso: count(),
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(unidades.empreendimentoId, id))
      .groupBy(achados.categoria, achados.local, achados.descricao)
      .having(sql`count(*) >= 2`)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
  ]);

  if (!vistoria || !unidade || !emp) notFound();

  const eventByAchadoId = new Map(
    eventosNestaVistoria.map((e) => [e.achadoId, e]),
  );

  // Pra cada achado originado aqui, junta TODOS os eventos da vistoria —
  // permite mostrar "achado criado" e "resolvido" como cards separados.
  // Ordem: por achado (ordem do novosAchados — afetada por drag-drop), e
  // dentro de cada achado o criado vem sempre antes de resolvido —
  // independente de timestamps, porque resolvido sem criado nao faz sentido
  // semantico.
  const TIPO_ORDER: Record<typeof eventosNestaVistoria[number]["tipo"], number> = {
    criado: 0,
    persiste: 1,
    nota: 2,
    resolvido: 3,
  };
  const eventosPorAchado = novosAchados.map((a) => ({
    achado: a,
    eventos: eventosNestaVistoria
      .filter((ev) => ev.achado != null && ev.achadoId === a.id)
      .sort((x, y) => {
        const byTipo = TIPO_ORDER[x.tipo] - TIPO_ORDER[y.tipo];
        if (byTipo !== 0) return byTipo;
        return x.createdAt.getTime() - y.createdAt.getTime();
      }),
  }));

  const activeShareTokens = allActiveTokens.filter((t) => !t.permiteUpload);
  const activeUploadToken =
    allActiveTokens.find((t) => t.permiteUpload) ?? null;

  const isDraft = vistoria.status === "rascunho";

  return (
    <UploadInFlightProvider>
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${id}` },
          { label: unidade.nome, href: `/empreendimentos/${id}/unidades/${uid}` },
          { label: `Vistoria ${formatDate(vistoria.data, dateFmt)}` },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
              Vistoria de{" "}
              <span className="font-tech">{formatDate(vistoria.data, dateFmt)}</span>
            </h1>
            <Badge
              variant="outline"
              className={VISTORIA_STATUS_BADGE[vistoria.status].className}
            >
              {VISTORIA_STATUS_BADGE[vistoria.status].label}
            </Badge>
          </div>
          {vistoria.vistoriadorNome ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="self-center font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Vistoriador
              </dt>
              <dd className="text-foreground">{vistoria.vistoriadorNome}</dd>
            </dl>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {isDraft ? (
            <MobileUploadButton
              vistoriaId={vistoria.id}
              baseUrl={env.BASE_URL}
              dateFmt={dateFmt}
              activeToken={
                activeUploadToken
                  ? {
                      token: activeUploadToken.token,
                      expiraEm: activeUploadToken.expiraEm.toISOString(),
                    }
                  : null
              }
            />
          ) : null}
          <VistoriaActionsBar vistoriaId={vistoria.id} status={vistoria.status} />
        </div>
      </div>

      <ObservacoesField
        vistoriaId={vistoria.id}
        initial={vistoria.observacoesGerais ?? ""}
        editable={isDraft}
      />

      {isDraft ? (
        <section className="space-y-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
                Achados em aberto da unidade
              </h2>
              {checklist.length > 0
                ? (() => {
                    // "marcados" = quantos do checklist ja tem evento NESTA
                    // vistoria. Nao usar eventByAchadoId.size direto porque
                    // ele inclui os 'criado' dos novos achados desta vistoria.
                    const marcados = checklist.reduce(
                      (n, a) => n + (eventByAchadoId.has(a.id) ? 1 : 0),
                      0,
                    );
                    const aMarcar = checklist.length - marcados;
                    return (
                      <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                        <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                          {String(marcados).padStart(2, "0")}
                        </span>{" "}
                        marcado{marcados === 1 ? "" : "s"} ·{" "}
                        <span className="tabular-nums text-amber-700 dark:text-amber-300">
                          {String(aMarcar).padStart(2, "0")}
                        </span>{" "}
                        a marcar
                      </span>
                    );
                  })()
                : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Marque cada um como resolvido ou que persiste. Os não marcados são
              ignorados nesta vistoria.
            </p>
          </div>

          {checklist.length === 0 ? (
            <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
              <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-8 text-center">
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                  <CheckCircle2
                    className="size-6 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                </div>
                <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                  Sem pendências anteriores
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nenhum achado de vistorias anteriores em aberto. Bom trabalho!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {checklist.map((a) => {
                const ev = eventByAchadoId.get(a.id);
                return (
                  <AchadoChecklistRow
                    key={a.id}
                    vistoriaId={vistoria.id}
                    achado={{
                      id: a.id,
                      categoria: a.categoria,
                      local: a.local,
                      descricao: a.descricao,
                      prazoEm: a.prazoEm,
                    }}
                    evento={
                      ev
                        ? {
                            id: ev.id,
                            tipo: ev.tipo,
                            notaExtra: ev.notaExtra,
                            fotos: ev.fotos.map((f) => ({
                              id: f.id,
                              arquivoPath: f.arquivoPath,
                              thumbPath: f.thumbPath,
                              legenda: f.legenda,
                            })),
                          }
                        : null
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <Separator />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
              {isDraft ? "Achados criados nesta vistoria" : "Achados desta vistoria"}
            </h2>
            {novosAchados.length > 0 ? (
              <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                <span className="tabular-nums text-foreground">
                  {String(novosAchados.length).padStart(2, "0")}
                </span>{" "}
                {novosAchados.length === 1 ? "achado" : "achados"}
              </span>
            ) : null}
          </div>
          {isDraft ? (
            <AchadoFormDialog
              vistoriaId={vistoria.id}
              templates={templatesFrequentes.map((t) => ({
                categoria: t.categoria,
                local: t.local,
                descricao: t.descricao,
                uso: Number(t.uso),
              }))}
            />
          ) : null}
        </div>

        {novosAchados.length === 0 ? (
          <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
            <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-8 text-center">
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                <ClipboardCheck
                  className="size-6 text-muted-foreground/60"
                  aria-hidden
                />
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Sem achados
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isDraft
                  ? "Clique em \"Novo achado\" pra registrar a primeira ocorrência desta vistoria."
                  : "Nenhum achado foi registrado nesta vistoria."}
              </p>
            </div>
          </div>
        ) : (
          <AchadosSortableList
            vistoriaId={vistoria.id}
            achadoIds={eventosPorAchado.map((g) => g.achado.id)}
            reorderable={isDraft && eventosPorAchado.length > 1}
          >
            {eventosPorAchado.map((g) => (
              <div key={g.achado.id} className="space-y-2">
                {g.eventos.map((ev) => (
                  <NovoAchadoCard
                    key={ev.id}
                    vistoriaId={vistoria.id}
                    achado={ev.achado!}
                    // So o evento "criado" e editavel — eventos "resolvido"
                    // retroativos sao registros historicos read-only.
                    editable={isDraft && ev.tipo === "criado"}
                    autor={vistoria.vistoriadorNome}
                    dateFmt={dateFmt}
                    evento={{
                      id: ev.id,
                      tipo: ev.tipo,
                      createdAt: ev.createdAt,
                      notaExtra: ev.notaExtra,
                      fotos: ev.fotos.map((f) => ({
                        id: f.id,
                        arquivoPath: f.arquivoPath,
                        thumbPath: f.thumbPath,
                        legenda: f.legenda,
                      })),
                    }}
                  />
                ))}
              </div>
            ))}
          </AchadosSortableList>
        )}
      </section>

      <Separator />

      <SharePanel
        vistoriaId={vistoria.id}
        baseUrl={env.BASE_URL}
        dateFmt={dateFmt}
        tokens={activeShareTokens.map((t) => ({
          id: t.id,
          token: t.token,
          expiraEm: t.expiraEm.toISOString(),
          criadoEm: t.criadoEm.toISOString(),
        }))}
      />
    </div>
    </UploadInFlightProvider>
  );
}
