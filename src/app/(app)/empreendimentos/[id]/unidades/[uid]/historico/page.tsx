import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  PlusCircle,
} from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  unidades,
  vistorias,
  CATEGORIA_LABELS,
  type Categoria,
  type EventoTipo,
} from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ItemVistoriaCriada = {
  kind: "vistoria-criada";
  at: Date;
  vistoriaId: string;
  data: string;
  vistoriador: string | null;
};

type ItemVistoriaFinalizada = {
  kind: "vistoria-finalizada";
  at: Date;
  vistoriaId: string;
  data: string;
};

type ItemEvento = {
  kind: "evento";
  at: Date;
  vistoriaId: string;
  vistoriaData: string;
  tipo: EventoTipo;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  notaExtra: string | null;
  vistoriador: string | null;
};

type Item = ItemVistoriaCriada | ItemVistoriaFinalizada | ItemEvento;

export default async function HistoricoUnidadePage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>;
}) {
  const { id, uid } = await params;

  const [[unidade], [emp], vistoriasList, eventosList] = await Promise.all([
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
      .orderBy(asc(vistorias.createdAt)),
    db
      .select({
        id: achadoEventos.id,
        createdAt: achadoEventos.createdAt,
        tipo: achadoEventos.tipo,
        notaExtra: achadoEventos.notaExtra,
        vistoriaId: achadoEventos.vistoriaId,
        vistoriaData: vistorias.data,
        vistoriador: vistorias.vistoriadorNome,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
      })
      .from(achadoEventos)
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
      .where(eq(vistorias.unidadeId, uid))
      .orderBy(desc(achadoEventos.createdAt)),
  ]);

  if (!unidade || !emp) notFound();

  const items: Item[] = [];

  for (const v of vistoriasList) {
    items.push({
      kind: "vistoria-criada",
      at: v.createdAt,
      vistoriaId: v.id,
      data: v.data,
      vistoriador: v.vistoriadorNome,
    });
    if (v.finalizadaEm) {
      items.push({
        kind: "vistoria-finalizada",
        at: v.finalizadaEm,
        vistoriaId: v.id,
        data: v.data,
      });
    }
  }

  for (const ev of eventosList) {
    items.push({
      kind: "evento",
      at: ev.createdAt,
      vistoriaId: ev.vistoriaId,
      vistoriaData: ev.vistoriaData,
      tipo: ev.tipo,
      categoria: ev.categoria,
      local: ev.local,
      descricao: ev.descricao,
      notaExtra: ev.notaExtra,
      vistoriador: ev.vistoriador,
    });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${id}` },
          {
            label: unidade.nome,
            href: `/empreendimentos/${id}/unidades/${uid}`,
          },
          { label: "Histórico" },
        ]}
      />

      <div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
          Histórico de {unidade.nome}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo que aconteceu nesta unidade em ordem cronológica — mais recente
          primeiro.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          eyebrow="Sem histórico"
          description="Crie uma vistoria pra começar."
        />
      ) : (
        <ol className="relative ml-3 space-y-4 border-l-2 border-dashed border-border/70 pl-6">
          {items.map((item, i) => (
            <TimelineItem
              key={i}
              item={item}
              href={`/empreendimentos/${id}/unidades/${uid}/vistorias/${item.vistoriaId}`}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

const EVENTO_ICON: Record<EventoTipo, typeof CheckCircle2> = {
  criado: PlusCircle,
  resolvido: CheckCircle2,
  persiste: AlertCircle,
  nota: MessageSquare,
};

const EVENTO_COLOR: Record<EventoTipo, string> = {
  criado: "text-amber-700 dark:text-amber-300",
  resolvido: "text-emerald-700 dark:text-emerald-300",
  persiste: "text-amber-700 dark:text-amber-300",
  nota: "text-blue-700 dark:text-blue-300",
};

const EVENTO_TITULO: Record<EventoTipo, string> = {
  criado: "Achado criado",
  resolvido: "Achado resolvido",
  persiste: "Achado persiste",
  nota: "Anotação",
};

function TimelineItem({ item, href }: { item: Item; href: string }) {
  if (item.kind === "vistoria-criada") {
    return (
      <li className="relative">
        <span
          aria-hidden
          className="absolute top-1.5 -left-[33px] flex size-5 items-center justify-center rounded-full border-2 border-background bg-amber-500 text-white dark:bg-amber-400"
        >
          <ClipboardList className="size-3" />
        </span>
        <Link
          href={href}
          className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent/40"
        >
          <p className="text-sm font-semibold">
            Vistoria iniciada
            {item.vistoriador ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {item.vistoriador}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            data {formatDateBR(item.data)} · registrada{" "}
            {formatDateTimeBR(item.at)}
          </p>
        </Link>
      </li>
    );
  }

  if (item.kind === "vistoria-finalizada") {
    return (
      <li className="relative">
        <span
          aria-hidden
          className="absolute top-1.5 -left-[33px] flex size-5 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-white dark:bg-emerald-400"
        >
          <ClipboardCheck className="size-3" />
        </span>
        <Link
          href={href}
          className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent/40"
        >
          <p className="text-sm font-semibold">Vistoria finalizada</p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            referente a {formatDateBR(item.data)} · finalizada{" "}
            {formatDateTimeBR(item.at)}
          </p>
        </Link>
      </li>
    );
  }

  const Icon = EVENTO_ICON[item.tipo];
  return (
    <li className="relative">
      <span
        aria-hidden
        className={cn(
          "absolute top-1.5 -left-[33px] flex size-5 items-center justify-center rounded-full border-2 border-background bg-card",
          EVENTO_COLOR[item.tipo],
        )}
      >
        <Icon className="size-3" />
      </span>
      <Link
        href={href}
        className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent/40"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-block size-2 shrink-0 rounded-full",
              CATEGORIA_DOT[item.categoria],
            )}
          />
          <span className={cn("text-sm font-semibold", EVENTO_COLOR[item.tipo])}>
            {EVENTO_TITULO[item.tipo]}
          </span>
          <span className="text-sm text-muted-foreground">
            · {CATEGORIA_LABELS[item.categoria]}
          </span>
          {item.local ? (
            <span className="text-sm text-foreground/80">— {item.local}</span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-foreground/90">
          {item.descricao}
        </p>
        {item.notaExtra ? (
          <p className="mt-1 line-clamp-2 border-l-2 border-muted-foreground/30 pl-2 text-xs italic text-muted-foreground">
            {item.notaExtra}
          </p>
        ) : null}
        <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatDateTimeBR(item.at)} · vistoria de{" "}
          {formatDateBR(item.vistoriaData)}
          {item.vistoriador ? ` · ${item.vistoriador}` : ""}
        </p>
      </Link>
    </li>
  );
}
