import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { eq, and, gt, asc } from "drizzle-orm";
import { FileDown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  achadoEventos,
  empreendimentos,
  fotos,
  shareTokens,
  unidades,
  vistorias,
  CATEGORIA_LABELS,
} from "@/db/schema";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const [row] = await db
    .select({
      vistoriaData: vistorias.data,
      unidadeNome: unidades.nome,
      empreendimentoNome: empreendimentos.nome,
    })
    .from(shareTokens)
    .innerJoin(vistorias, eq(vistorias.id, shareTokens.vistoriaId))
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .innerJoin(empreendimentos, eq(empreendimentos.id, unidades.empreendimentoId))
    .where(
      and(eq(shareTokens.token, token), gt(shareTokens.expiraEm, new Date())),
    )
    .limit(1);

  if (!row) {
    return {
      title: "Vistoria — DiMinson Engenharia",
      robots: { index: false, follow: false },
    };
  }

  const title = `${row.empreendimentoNome} · ${row.unidadeNome}`;
  const description = `Vistoria de instalações de ${formatDateBR(row.vistoriaData)} — DiMinson Engenharia.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "article" },
  };
}

const tipoLabels: Record<string, string> = {
  criado: "Achado criado",
  persiste: "Persiste",
  resolvido: "Resolvido",
  nota: "Anotação",
};

const tipoVariants: Record<string, "default" | "secondary" | "outline"> = {
  criado: "outline",
  persiste: "secondary",
  resolvido: "default",
  nota: "outline",
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [share] = await db
    .select()
    .from(shareTokens)
    .where(
      and(eq(shareTokens.token, token), gt(shareTokens.expiraEm, new Date())),
    )
    .limit(1);

  if (!share) {
    return (
      <div className="flex flex-1 min-h-screen items-center justify-center p-6">
        <div className="text-center max-w-sm flex flex-col items-center">
          <Image
            src="/logo-diminson.png"
            alt="DiMinson Engenharia"
            width={300}
            height={96}
            priority
            className="h-10 w-auto mb-6"
          />
          <Lock className="size-12 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">Link inválido ou expirado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este link de compartilhamento não está mais ativo. Entre em contato
            com a engenharia para solicitar um novo.
          </p>
        </div>
      </div>
    );
  }

  const [[vistoria], eventos] = await Promise.all([
    db
      .select()
      .from(vistorias)
      .where(eq(vistorias.id, share.vistoriaId))
      .limit(1),
    db.query.achadoEventos.findMany({
      where: eq(achadoEventos.vistoriaId, share.vistoriaId),
      with: {
        fotos: { orderBy: asc(fotos.ordem) },
        achado: true,
      },
      orderBy: asc(achadoEventos.createdAt),
    }),
  ]);
  if (!vistoria) notFound();

  const [[unidade], empRow] = await Promise.all([
    db
      .select()
      .from(unidades)
      .where(eq(unidades.id, vistoria.unidadeId))
      .limit(1),
    db
      .select()
      .from(empreendimentos)
      .innerJoin(unidades, eq(unidades.empreendimentoId, empreendimentos.id))
      .where(eq(unidades.id, vistoria.unidadeId))
      .limit(1),
  ]);
  const emp = empRow[0]?.empreendimentos;
  if (!unidade || !emp) notFound();

  const visibleEventos = eventos.filter((e) => e.achado != null);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="bg-background border-b">
        <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
          <Image
            src="/logo-diminson.png"
            alt="DiMinson Engenharia"
            width={300}
            height={96}
            priority
            className="h-10 w-auto"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Vistoria de instalações
              </p>
              <h1 className="text-2xl font-semibold mt-1">{emp.nome}</h1>
              <p className="text-sm text-muted-foreground">
                {unidade.nome} · {formatDateBR(vistoria.data)}
                {vistoria.vistoriadorNome
                  ? ` · ${vistoria.vistoriadorNome}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={vistoria.status === "finalizada" ? "default" : "secondary"}>
                {vistoria.status === "finalizada" ? "Finalizada" : "Em andamento"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                render={
                  <a
                    href={`/api/pdf/${vistoria.id}?token=${encodeURIComponent(token)}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <FileDown className="mr-1.5 size-4" />
                PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
          {vistoria.observacoesGerais ? (
            <section className="rounded-lg border bg-background p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Observações gerais
              </h2>
              <p className="mt-2 text-sm whitespace-pre-line">
                {vistoria.observacoesGerais}
              </p>
            </section>
          ) : null}

          {visibleEventos.length === 0 ? (
            <p className="rounded-lg border bg-background p-6 text-sm text-center text-muted-foreground">
              Nenhum item registrado nesta vistoria.
            </p>
          ) : (
            <ul className="space-y-3">
              {visibleEventos.map((ev) => {
                if (!ev.achado) return null;
                const tipoLabel = tipoLabels[ev.tipo] ?? ev.tipo;
                return (
                  <li
                    key={ev.id}
                    className="rounded-lg border bg-background p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {CATEGORIA_LABELS[ev.achado.categoria]}
                      </Badge>
                      {ev.achado.local ? (
                        <span className="text-sm font-medium">
                          {ev.achado.local}
                        </span>
                      ) : null}
                      <Badge variant={tipoVariants[ev.tipo] ?? "outline"}>
                        {tipoLabel}
                      </Badge>
                    </div>
                    <p className="text-sm whitespace-pre-line">
                      {ev.achado.descricao}
                    </p>
                    {ev.notaExtra ? (
                      <p className="text-sm border-l-2 pl-3 italic text-muted-foreground whitespace-pre-line">
                        {ev.notaExtra}
                      </p>
                    ) : null}
                    {ev.fotos.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                        {ev.fotos.map((f) => (
                          <figure key={f.id} className="space-y-1">
                            <a
                              href={`/api/files/${f.arquivoPath}?token=${encodeURIComponent(token)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/files/${f.thumbPath}?token=${encodeURIComponent(token)}`}
                                alt={f.legenda ?? ""}
                                className="aspect-square w-full rounded-md border object-cover"
                              />
                            </a>
                            {f.legenda ? (
                              <figcaption className="text-xs text-muted-foreground line-clamp-2">
                                {f.legenda}
                              </figcaption>
                            ) : null}
                          </figure>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto max-w-4xl px-4 py-4 text-center text-xs text-muted-foreground space-y-1">
          {vistoria.finalizadaEm ? (
            <p>
              Vistoria finalizada em {formatDateTimeBR(vistoria.finalizadaEm)}
            </p>
          ) : null}
          <p>
            Link válido até {formatDateTimeBR(share.expiraEm)}.
          </p>
        </div>
      </footer>
    </div>
  );
}
