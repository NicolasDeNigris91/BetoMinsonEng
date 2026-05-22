import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, count, countDistinct, sql } from "drizzle-orm";
import { ClipboardList } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  escopoAchados,
  escopos,
} from "@/db/schema";
import { parseUuidOrNotFound } from "@/lib/route-params";
import { getDateFormat } from "@/lib/date-format-server";
import { formatDateTime } from "@/lib/format";
import { EscopoFormDialog } from "./novo-escopo-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Escopos" };

export default async function EscoposListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseUuidOrNotFound(rawId);
  const dateFmt = await getDateFormat();

  const [[emp], lista] = await Promise.all([
    db
      .select()
      .from(empreendimentos)
      .where(eq(empreendimentos.id, id))
      .limit(1),
    db
      .select({
        id: escopos.id,
        nome: escopos.nome,
        descricao: escopos.descricao,
        createdAt: escopos.createdAt,
        updatedAt: escopos.updatedAt,
        nAchados: count(escopoAchados.achadoId),
        nUnidades: countDistinct(achados.unidadeId),
      })
      .from(escopos)
      .leftJoin(escopoAchados, eq(escopoAchados.escopoId, escopos.id))
      .leftJoin(achados, eq(achados.id, escopoAchados.achadoId))
      .where(eq(escopos.empreendimentoId, id))
      .groupBy(escopos.id)
      .orderBy(desc(escopos.updatedAt)),
  ]);

  if (!emp) notFound();

  const totalAchadosAtribuidos = lista.reduce((s, e) => s + Number(e.nAchados), 0);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${emp.id}` },
          { label: "Escopos" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            Escopos de trabalho
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Agrupe achados de várias unidades em ordens de serviço pra enviar
            ao profissional responsável.
          </p>
        </div>
        {lista.length > 0 ? <EscopoFormDialog empreendimentoId={emp.id} /> : null}
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Lista
          </h2>
          {lista.length > 0 ? (
            <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
              <span className="tabular-nums text-foreground">
                {String(lista.length).padStart(2, "0")}
              </span>{" "}
              {lista.length === 1 ? "escopo" : "escopos"} ·{" "}
              <span className="tabular-nums text-foreground">
                {String(totalAchadosAtribuidos).padStart(2, "0")}
              </span>{" "}
              {totalAchadosAtribuidos === 1
                ? "achado atribuído"
                : "achados atribuídos"}
            </span>
          ) : null}
        </div>

        {lista.length === 0 ? (
          <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
            <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center">
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                <ClipboardList
                  className="size-6 text-muted-foreground/60"
                  aria-hidden
                />
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Sem escopos ainda
              </p>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Crie um escopo pra começar a montar uma ordem de serviço.
              </p>
              <EscopoFormDialog empreendimentoId={emp.id} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map((e) => (
              <Link
                key={e.id}
                href={`/empreendimentos/${emp.id}/escopos/${e.id}`}
                className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="rounded-lg border bg-card p-4 transition-all hover:-translate-y-px hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{e.nome}</h3>
                        <span className="rounded-full border border-border bg-muted/50 px-2 py-[1px] font-mono text-[10px] tabular-nums">
                          {String(Number(e.nAchados)).padStart(2, "0")}{" "}
                          {Number(e.nAchados) === 1 ? "achado" : "achados"}
                        </span>
                        {Number(e.nUnidades) > 0 ? (
                          <span className="rounded-full border border-border bg-muted/50 px-2 py-[1px] font-mono text-[10px] tabular-nums">
                            {String(Number(e.nUnidades)).padStart(2, "0")}{" "}
                            {Number(e.nUnidades) === 1 ? "unidade" : "unidades"}
                          </span>
                        ) : null}
                      </div>
                      {e.descricao ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {e.descricao}
                        </p>
                      ) : null}
                      <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                        Atualizado em{" "}
                        <span className="tabular-nums">
                          {formatDateTime(e.updatedAt, dateFmt)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
