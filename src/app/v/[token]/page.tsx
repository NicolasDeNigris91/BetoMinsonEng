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
  type Categoria,
} from "@/db/schema";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_STRIPE_BORDER,
  EVENTO_BADGE,
  VISTORIA_STATUS_BADGE,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { PrintButton } from "./print-button";

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
      and(
        eq(shareTokens.token, token),
        eq(shareTokens.permiteUpload, false),
        gt(shareTokens.expiraEm, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      title: "Link inválido",
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

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Tokens de upload (permiteUpload=true) so servem /v/[token]/celular —
  // a vista completa de leitura e exclusiva de tokens de leitura, pra
  // evitar que o link do mestre-de-obras vaze o PDF inteiro.
  const [share] = await db
    .select()
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, token),
        eq(shareTokens.permiteUpload, false),
        gt(shareTokens.expiraEm, new Date()),
      ),
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

  // Resumo executivo — contagens por achado distinto (evita double-count
  // quando um achado tem criado + resolvido na mesma vistoria).
  const achadosNaVistoria = new Map<
    string,
    { categoria: Categoria; resolvidoNaVistoria: boolean }
  >();
  for (const ev of visibleEventos) {
    if (!ev.achado) continue;
    const existing = achadosNaVistoria.get(ev.achadoId);
    const resolvidoNaVistoria =
      ev.tipo === "resolvido" || existing?.resolvidoNaVistoria === true;
    achadosNaVistoria.set(ev.achadoId, {
      categoria: ev.achado.categoria,
      resolvidoNaVistoria,
    });
  }
  const totalAchados = achadosNaVistoria.size;
  let totalResolvidos = 0;
  const porCategoria = new Map<Categoria, number>();
  for (const a of achadosNaVistoria.values()) {
    if (a.resolvidoNaVistoria) totalResolvidos++;
    porCategoria.set(a.categoria, (porCategoria.get(a.categoria) ?? 0) + 1);
  }
  const totalEmAberto = totalAchados - totalResolvidos;

  // Agrupa visibleEventos por categoria pra render. Ordem fixa do enum pras
  // secoes serem consistentes entre vistorias.
  const ORDEM_CATEGORIA: Categoria[] = [
    "ELE",
    "HID",
    "HVAC",
    "PISCINA",
    "ASP",
    "SIS",
  ];
  const eventosPorCategoria = new Map<Categoria, typeof visibleEventos>();
  for (const ev of visibleEventos) {
    if (!ev.achado) continue;
    const cat = ev.achado.categoria;
    const arr = eventosPorCategoria.get(cat) ?? [];
    arr.push(ev);
    eventosPorCategoria.set(cat, arr);
  }
  const categoriasPresentes = ORDEM_CATEGORIA.filter((c) =>
    eventosPorCategoria.has(c),
  );

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 print:bg-white">
      <header className="bg-background border-b print:border-b-2">
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
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
                {emp.nome}
              </h1>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="self-center font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Unidade
                </dt>
                <dd>{unidade.nome}</dd>
                <dt className="self-center font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Data
                </dt>
                <dd className="font-tech">{formatDateBR(vistoria.data)}</dd>
                {vistoria.vistoriadorNome ? (
                  <>
                    <dt className="self-center font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                      Vistoriador
                    </dt>
                    <dd>{vistoria.vistoriadorNome}</dd>
                  </>
                ) : null}
              </dl>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge
                variant="outline"
                className={VISTORIA_STATUS_BADGE[vistoria.status].className}
              >
                {VISTORIA_STATUS_BADGE[vistoria.status].label}
              </Badge>
              <div className="flex gap-2">
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
                  <FileDown className="mr-1.5 size-4 text-red-600 dark:text-red-500" />
                  PDF
                </Button>
                <PrintButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      {totalAchados > 0 ? (
        <section className="bg-muted/40 border-b print:bg-white">
          <div className="mx-auto max-w-4xl px-4 py-4">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
              Resumo executivo
            </p>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Total
                </p>
                <p className="font-tech text-2xl">
                  {String(totalAchados).padStart(2, "0")}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {totalAchados === 1 ? "achado" : "achados"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Em aberto
                </p>
                <p
                  className={cn(
                    "font-tech text-2xl",
                    totalEmAberto > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : undefined,
                  )}
                >
                  {String(totalEmAberto).padStart(2, "0")}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {totalEmAberto > 0 ? "precisam ação" : "—"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Resolvidos
                </p>
                <p
                  className={cn(
                    "font-tech text-2xl",
                    totalResolvidos > 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : undefined,
                  )}
                >
                  {String(totalResolvidos).padStart(2, "0")}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {totalResolvidos > 0 ? "durante vistoria" : "—"}
                </p>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-right font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Distribuição por matéria
                </p>
                <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                  {categoriasPresentes.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className={cn("font-mono text-xs", CATEGORIA_BADGE_CLASS[cat])}
                    >
                      {CATEGORIA_LABELS[cat]} · {porCategoria.get(cat)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
          {vistoria.observacoesGerais ? (
            <section className="rounded-lg border bg-background p-4">
              <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
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
            categoriasPresentes.map((cat) => {
              const eventosCat = eventosPorCategoria.get(cat) ?? [];
              const resolvidosCat = eventosCat.filter(
                (e) => e.tipo === "resolvido",
              ).length;
              const abertosCat = new Set(
                eventosCat
                  .filter((e) => e.achado && e.tipo !== "resolvido")
                  .map((e) => e.achadoId),
              ).size;
              return (
                <section key={cat}>
                  <h2 className="mb-2 flex flex-wrap items-baseline gap-2 text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
                    {CATEGORIA_LABELS[cat]}
                    <span className="font-mono text-[10px] tracking-[0.06em] normal-case text-muted-foreground">
                      {abertosCat > 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          {abertosCat} em aberto
                        </span>
                      ) : null}
                      {abertosCat > 0 && resolvidosCat > 0 ? " · " : ""}
                      {resolvidosCat > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          {resolvidosCat} resolvido{resolvidosCat === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </span>
                  </h2>
                  <ul className="space-y-3">
                    {eventosCat.map((ev) => {
                      if (!ev.achado) return null;
                      const eventoBadge = EVENTO_BADGE[ev.tipo];
                      const hasFotos = ev.fotos.length > 0;
                      return (
                        <li
                          key={ev.id}
                          className={cn(
                            "rounded-lg border border-l-4 bg-background p-4 shadow-sm",
                            CATEGORIA_STRIPE_BORDER[ev.achado.categoria],
                          )}
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start">
                            {hasFotos ? (
                              <div className="md:w-72 md:shrink-0">
                                <div
                                  className={cn(
                                    "grid gap-2",
                                    ev.fotos.length === 1
                                      ? "grid-cols-1"
                                      : "grid-cols-2",
                                  )}
                                >
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
                                          alt={f.legenda ?? "Foto anexada ao achado"}
                                          loading="lazy"
                                          decoding="async"
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
                              </div>
                            ) : null}
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                {ev.achado.local ? (
                                  <span className="text-sm font-medium">
                                    {ev.achado.local}
                                  </span>
                                ) : null}
                                {eventoBadge ? (
                                  <Badge variant="outline" className={eventoBadge.className}>
                                    {eventoBadge.label}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    Achado criado
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm whitespace-pre-line">
                                {ev.achado.descricao}
                              </p>
                              {ev.notaExtra ? (
                                <p className="border-l-2 pl-3 text-sm italic text-muted-foreground whitespace-pre-line">
                                  {ev.notaExtra}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </main>

      <footer className="border-t bg-background print:border-t-2">
        <div className="mx-auto max-w-4xl px-4 py-4 text-center text-xs text-muted-foreground space-y-1">
          {vistoria.finalizadaEm ? (
            <p>
              Vistoria finalizada em{" "}
              <span className="font-mono">
                {formatDateTimeBR(vistoria.finalizadaEm)}
              </span>
            </p>
          ) : null}
          <p>
            Link válido até{" "}
            <span className="font-mono">{formatDateTimeBR(share.expiraEm)}</span>
            .
          </p>
          <p className="pt-1 font-mono text-[10px] tracking-[0.18em] uppercase">
            DiMinson Engenharia · Vistorias e Inspeções Técnicas
          </p>
        </div>
      </footer>
    </div>
  );
}
