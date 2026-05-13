import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, ne, asc, gt, desc } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
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
import { formatDateBR } from "@/lib/format";
import { AchadoChecklistRow } from "./achado-checklist-row";
import { AchadoFormDialog } from "./novo-achado-dialog";
import { MobileUploadButton } from "./mobile-upload-button";
import { NovoAchadoCard } from "./novo-achado-card";
import { ObservacoesField } from "./observacoes-field";
import { SharePanel } from "./share-panel";
import { VistoriaActionsBar } from "./vistoria-actions-bar";

export const dynamic = "force-dynamic";

export default async function VistoriaPage({
  params,
}: {
  params: Promise<{ id: string; uid: string; vid: string }>;
}) {
  const { id, uid, vid } = await params;

  const [
    [vistoria],
    [unidade],
    [emp],
    checklist,
    eventosNestaVistoria,
    novosAchados,
    allActiveTokens,
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
      with: { fotos: true },
    }),
    db
      .select()
      .from(achados)
      .where(eq(achados.vistoriaOrigemId, vid))
      .orderBy(asc(achados.categoria), asc(achados.createdAt)),
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
  ]);

  if (!vistoria || !unidade || !emp) notFound();

  const eventByAchadoId = new Map(
    eventosNestaVistoria.map((e) => [e.achadoId, e]),
  );

  const activeShareTokens = allActiveTokens.filter((t) => !t.permiteUpload);
  const activeUploadToken =
    allActiveTokens.find((t) => t.permiteUpload) ?? null;

  const isDraft = vistoria.status === "rascunho";

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/empreendimentos" className="hover:text-foreground">
          Empreendimentos
        </Link>
        <ChevronRight className="size-4" />
        <Link href={`/empreendimentos/${id}`} className="hover:text-foreground">
          {emp.nome}
        </Link>
        <ChevronRight className="size-4" />
        <Link
          href={`/empreendimentos/${id}/unidades/${uid}`}
          className="hover:text-foreground"
        >
          {unidade.nome}
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">
          Vistoria {formatDateBR(vistoria.data)}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Vistoria de {formatDateBR(vistoria.data)}
            </h1>
            <Badge variant={isDraft ? "secondary" : "default"}>
              {isDraft ? "Rascunho" : "Finalizada"}
            </Badge>
          </div>
          {vistoria.vistoriadorNome ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Vistoriador: {vistoria.vistoriadorNome}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {isDraft ? (
            <MobileUploadButton
              vistoriaId={vistoria.id}
              baseUrl={env.BASE_URL}
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
            <h2 className="text-lg font-medium">
              Achados em aberto da unidade
            </h2>
            <p className="text-sm text-muted-foreground">
              Marque cada um como resolvido ou que persiste. Os não marcados são
              ignorados nesta vistoria.
            </p>
          </div>

          {checklist.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
              Nenhum achado de vistorias anteriores em aberto. Bom trabalho!
            </p>
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">
              {isDraft ? "Achados criados nesta vistoria" : "Achados desta vistoria"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {novosAchados.length} {novosAchados.length === 1 ? "achado" : "achados"}
            </p>
          </div>
          {isDraft ? (
            <AchadoFormDialog vistoriaId={vistoria.id} />
          ) : null}
        </div>

        {novosAchados.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
            Nenhum achado registrado nesta vistoria ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {novosAchados.map((a) => {
              const ev = eventByAchadoId.get(a.id);
              if (!ev) return null;
              return (
                <NovoAchadoCard
                  key={a.id}
                  vistoriaId={vistoria.id}
                  achado={a}
                  editable={isDraft}
                  evento={{
                    id: ev.id,
                    notaExtra: ev.notaExtra,
                    fotos: ev.fotos.map((f) => ({
                      id: f.id,
                      arquivoPath: f.arquivoPath,
                      thumbPath: f.thumbPath,
                      legenda: f.legenda,
                    })),
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      <Separator />

      <SharePanel
        vistoriaId={vistoria.id}
        baseUrl={env.BASE_URL}
        tokens={activeShareTokens.map((t) => ({
          id: t.id,
          token: t.token,
          expiraEm: t.expiraEm.toISOString(),
          criadoEm: t.criadoEm.toISOString(),
        }))}
      />
    </div>
  );
}
