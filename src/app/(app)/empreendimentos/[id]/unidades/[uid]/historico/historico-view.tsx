"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  HardHat,
  MessageSquare,
  PlusCircle,
} from "lucide-react";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { formatTimeBR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Mesmos tipos do server, redeclarados pra evitar circular import.
type EventoTipo = "criado" | "resolvido" | "persiste" | "nota";

export type HistoricoItem =
  | {
      kind: "vistoria-criada";
      at: string; // ISO
      vistoriaId: string;
      data: string;
      vistoriador: string | null;
    }
  | {
      kind: "vistoria-finalizada";
      at: string;
      vistoriaId: string;
      data: string;
    }
  | {
      kind: "evento";
      at: string;
      vistoriaId: string;
      vistoriaData: string;
      tipo: EventoTipo;
      categoria: Categoria;
      local: string | null;
      descricao: string;
      notaExtra: string | null;
      vistoriador: string | null;
      /** Quando setado, evento foi registrado via link publico de um escopo. */
      escopoOrigemId: string | null;
      escopoOrigemNome: string | null;
    };

export type DayGroup = {
  /** chave ISO YYYY-MM-DD */
  dia: string;
  /** label relativa pre-calculada no server (ex: "hoje", "ontem", "ha 5 dias") */
  rel: string;
  /** label BR formatada (ex: "16/05/2026") */
  dataBR: string;
  items: HistoricoItem[];
};

type FilterKey = "todos" | "criado" | "resolvido" | "persiste" | "nota" | "vistoria";

const FILTERS: { key: FilterKey; label: string; color?: string }[] = [
  { key: "todos", label: "todos" },
  { key: "criado", label: "+ criado", color: "text-amber-700 dark:text-amber-300" },
  { key: "resolvido", label: "✓ resolvido", color: "text-emerald-700 dark:text-emerald-300" },
  { key: "persiste", label: "! persiste", color: "text-amber-700 dark:text-amber-300" },
  { key: "nota", label: "▮ nota", color: "text-blue-700 dark:text-blue-300" },
  { key: "vistoria", label: "▶ vistoria", color: "text-foreground" },
];

function itemMatches(item: HistoricoItem, filter: FilterKey): boolean {
  if (filter === "todos") return true;
  if (filter === "vistoria") {
    return item.kind === "vistoria-criada" || item.kind === "vistoria-finalizada";
  }
  return item.kind === "evento" && item.tipo === filter;
}

function countByFilter(items: HistoricoItem[], filter: FilterKey): number {
  if (filter === "todos") return items.length;
  return items.filter((i) => itemMatches(i, filter)).length;
}

type Props = {
  empreendimentoId: string;
  unidadeId: string;
  totalEventos: number;
  totalVistorias: number;
  groups: DayGroup[];
};

export function HistoricoView({
  empreendimentoId,
  unidadeId,
  totalEventos,
  totalVistorias,
  groups,
}: Props) {
  const [active, setActive] = useState<FilterKey>("todos");

  // Indices pre-calculados pros chips (total absoluto sempre, ignora filtro).
  const allItems = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );
  const counts = useMemo(() => {
    const map = new Map<FilterKey, number>();
    for (const f of FILTERS) {
      map.set(f.key, countByFilter(allItems, f.key));
    }
    return map;
  }, [allItems]);

  // Filtra items dentro de cada grupo; remove dias que ficaram vazios.
  const filteredGroups = useMemo(() => {
    if (active === "todos") return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => itemMatches(i, active)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, active]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
          Histórico
        </h1>
        <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
          <span className="tabular-nums text-foreground">
            {String(totalEventos).padStart(2, "0")}
          </span>{" "}
          {totalEventos === 1 ? "evento" : "eventos"} ·{" "}
          <span className="tabular-nums text-foreground">
            {String(totalVistorias).padStart(2, "0")}
          </span>{" "}
          {totalVistorias === 1 ? "vistoria" : "vistorias"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          filtrar:
        </span>
        {FILTERS.map((f) => {
          const n = counts.get(f.key) ?? 0;
          const isActive = active === f.key;
          if (f.key !== "todos" && n === 0) return null; // some chip when no items
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(f.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] tracking-[0.04em] transition",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted",
                !isActive && f.color,
              )}
            >
              {f.label} · {n}
            </button>
          );
        })}
      </div>

      {filteredGroups.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
          Nenhum evento nesse filtro.
        </p>
      ) : (
        <div className="space-y-5">
          {filteredGroups.map((g) => (
            <DaySection
              key={g.dia}
              group={g}
              empreendimentoId={empreendimentoId}
              unidadeId={unidadeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DaySection({
  group,
  empreendimentoId,
  unidadeId,
}: {
  group: DayGroup;
  empreendimentoId: string;
  unidadeId: string;
}) {
  const isToday = group.rel === "hoje";
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-border bg-background/90 py-1.5 backdrop-blur">
        <p
          className={cn(
            "font-mono text-[11px] font-bold tracking-[0.14em] uppercase",
            isToday ? "text-brand" : "text-muted-foreground",
          )}
        >
          {group.rel} ·{" "}
          <span className="font-tech text-base font-extrabold tracking-normal text-foreground">
            {group.dataBR}
          </span>
        </p>
        <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
          {group.items.length}{" "}
          {group.items.length === 1 ? "evento" : "eventos"}
        </span>
      </div>
      <ol className="relative mt-2 ml-2 space-y-1.5 border-l-2 border-dashed border-border/70 pl-5">
        {group.items.map((item, i) => (
          <TimelineRow
            key={i}
            item={item}
            href={`/empreendimentos/${empreendimentoId}/unidades/${unidadeId}/vistorias/${item.vistoriaId}`}
          />
        ))}
      </ol>
    </section>
  );
}

const TIPO_LABEL: Record<EventoTipo, string> = {
  criado: "+ criado",
  resolvido: "✓ resolvido",
  persiste: "! persiste",
  nota: "▮ nota",
};

const TIPO_COLOR: Record<EventoTipo, string> = {
  criado: "text-amber-700 dark:text-amber-300",
  resolvido: "text-emerald-700 dark:text-emerald-300",
  persiste: "text-amber-700 dark:text-amber-300",
  nota: "text-blue-700 dark:text-blue-300",
};

function TimelineRow({
  item,
  href,
}: {
  item: HistoricoItem;
  href: string;
}) {
  if (item.kind === "vistoria-criada") {
    return (
      <li>
        <Link
          href={href}
          className="flex flex-wrap items-baseline gap-x-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-accent/40"
        >
          <span className="w-12 font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatTimeBR(item.at)}
          </span>
          <span className="font-semibold text-foreground">▶ vistoria iniciada</span>
          {item.vistoriador ? (
            <span className="text-muted-foreground">· {item.vistoriador}</span>
          ) : null}
        </Link>
      </li>
    );
  }

  if (item.kind === "vistoria-finalizada") {
    return (
      <li>
        <Link
          href={href}
          className="flex flex-wrap items-baseline gap-x-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-accent/40"
        >
          <span className="w-12 font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatTimeBR(item.at)}
          </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ vistoria finalizada
          </span>
        </Link>
      </li>
    );
  }

  const viaEscopo = Boolean(item.escopoOrigemId && item.escopoOrigemNome);
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-accent/40",
          viaEscopo && "border-l-2 border-brand bg-brand/[0.03] pl-2",
        )}
      >
        <span className="w-12 font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatTimeBR(item.at)}
        </span>
        <span
          aria-hidden
          className={cn(
            "inline-block size-1.5 shrink-0 rounded-full",
            CATEGORIA_DOT[item.categoria],
          )}
        />
        <span className={cn("font-semibold", TIPO_COLOR[item.tipo])}>
          {TIPO_LABEL[item.tipo]}
        </span>
        <span className="text-muted-foreground">
          {CATEGORIA_LABELS[item.categoria]}
          {item.local ? ` · ${item.local}` : ""} —{" "}
          <span className="text-foreground/80">{item.descricao}</span>
        </span>
        {viaEscopo && item.escopoOrigemNome ? (
          <span className="ml-1 inline-flex items-center gap-1 text-brand">
            <HardHat className="size-3" aria-hidden />
            via escopo:{" "}
            <span className="font-semibold">{item.escopoOrigemNome}</span>
          </span>
        ) : item.vistoriador ? (
          <span className="text-muted-foreground">· {item.vistoriador}</span>
        ) : null}
      </Link>
    </li>
  );
}

// Silence unused-import warnings (icons usados em versoes anteriores, mantidos
// caso alguma row precise volte a ser visual no futuro). Tree-shake remove.
void PlusCircle;
void CheckCircle2;
void AlertCircle;
void MessageSquare;
void ClipboardList;
void ClipboardCheck;
