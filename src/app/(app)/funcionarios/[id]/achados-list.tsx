"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_STRIPE_BORDER,
} from "@/lib/category-styles";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { cn } from "@/lib/utils";
import { PrazoBadge } from "@/components/prazo-badge";
import { toast } from "sonner";
import { RemoverAchadoButton } from "./remover-achado-button";
import { setPrioridadeAchadoAction } from "../actions";

type Status = "aberto" | "persiste" | "resolvido";
type Prioridade = "alta" | "media" | null;

export type AchadoItem = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  status: Status;
  prazoEm: string | null;
  prioridade: Prioridade;
};

export type AchadoUnidade = {
  unidadeId: string;
  unidadeNome: string;
  itens: AchadoItem[];
};

export type AchadoGrupo = {
  empreendimentoId: string;
  empreendimentoNome: string;
  unidades: AchadoUnidade[];
};

type Filtro = "abertos" | "resolvidos" | "todos";

type Props = {
  funcionarioId: string;
  grupos: AchadoGrupo[];
};

function matches(status: Status, filtro: Filtro): boolean {
  if (filtro === "todos") return true;
  if (filtro === "resolvidos") return status === "resolvido";
  return status !== "resolvido";
}

export function AchadosList({ funcionarioId, grupos }: Props) {
  const counts = useMemo(() => {
    let abertos = 0;
    let resolvidos = 0;
    for (const g of grupos) {
      for (const u of g.unidades) {
        for (const it of u.itens) {
          if (it.status === "resolvido") resolvidos++;
          else abertos++;
        }
      }
    }
    return { abertos, resolvidos, total: abertos + resolvidos };
  }, [grupos]);

  const [filtro, setFiltro] = useState<Filtro>(
    counts.abertos > 0 ? "abertos" : "resolvidos",
  );

  const filtrados = useMemo(() => {
    const prioWeight = (p: Prioridade) =>
      p === "alta" ? 0 : p === "media" ? 1 : 2;
    return grupos
      .map((g) => ({
        ...g,
        unidades: g.unidades
          .map((u) => ({
            ...u,
            itens: u.itens
              .filter((it) => matches(it.status, filtro))
              .slice()
              .sort((a, b) => prioWeight(a.prioridade) - prioWeight(b.prioridade)),
          }))
          .filter((u) => u.itens.length > 0),
      }))
      .filter((g) => g.unidades.length > 0);
  }, [grupos, filtro]);

  const tudoResolvido = counts.abertos === 0 && counts.resolvidos > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          active={filtro === "abertos"}
          onClick={() => setFiltro("abertos")}
          label="abertos"
          count={counts.abertos}
          tone="amber"
        />
        <Chip
          active={filtro === "resolvidos"}
          onClick={() => setFiltro("resolvidos")}
          label="resolvidos"
          count={counts.resolvidos}
          tone="emerald"
        />
        <Chip
          active={filtro === "todos"}
          onClick={() => setFiltro("todos")}
          label="todos"
          count={counts.total}
        />
      </div>

      {tudoResolvido && filtro === "abertos" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Nada pendente.
            </span>{" "}
            <span className="text-muted-foreground">
              {counts.resolvidos}{" "}
              {counts.resolvidos === 1 ? "achado já resolvido" : "achados já resolvidos"}.
            </span>
          </p>
          <button
            type="button"
            onClick={() => setFiltro("resolvidos")}
            className="font-mono text-[10px] tracking-[0.12em] uppercase text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ver resolvidos →
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum achado nesse filtro.
        </p>
      ) : (
        <div className="max-h-[640px] space-y-4 overflow-y-auto rounded-lg border bg-muted/10 p-3">
          {filtrados.map((g) => {
            const total = g.unidades.reduce((s, u) => s + u.itens.length, 0);
            return (
              <div key={g.empreendimentoId} className="rounded-lg border bg-card">
                <header className="border-b border-dashed border-border bg-muted/30 px-4 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/empreendimentos/${g.empreendimentoId}`}
                      className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground hover:underline"
                    >
                      {g.empreendimentoNome}
                    </Link>
                    <span className="font-mono text-[10px] tabular-nums tracking-[0.06em] text-muted-foreground">
                      {total} {total === 1 ? "achado" : "achados"}
                    </span>
                  </div>
                </header>
                {g.unidades.map((u) => (
                  <div
                    key={u.unidadeId}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <div className="bg-muted/15 px-4 py-1.5">
                      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                        {u.unidadeNome}
                      </p>
                    </div>
                    <ul>
                      {u.itens.map((it) => (
                        <Row
                          key={it.achadoId}
                          item={it}
                          funcionarioId={funcionarioId}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({
  item,
  funcionarioId,
}: {
  item: AchadoItem;
  funcionarioId: string;
}) {
  const [pending, start] = useTransition();

  const setPrio = (p: Prioridade) => {
    if (p === item.prioridade) return;
    start(async () => {
      const r = await setPrioridadeAchadoAction(
        funcionarioId,
        item.achadoId,
        p,
      );
      if (r?.error) toast.error(r.error);
    });
  };

  const resolvido = item.status === "resolvido";

  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-border/30 px-4 py-3 last:border-b-0",
        CATEGORIA_STRIPE_BORDER[item.categoria],
        pending && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[11px]",
              CATEGORIA_BADGE_CLASS[item.categoria],
            )}
          >
            {CATEGORIA_LABELS[item.categoria]}
          </Badge>
          {item.local ? (
            <span className="text-sm font-medium">{item.local}</span>
          ) : null}
          {resolvido ? (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
              resolvido
            </span>
          ) : null}
          {!resolvido && item.prioridade === "alta" ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.1em] text-red-700 dark:text-red-300">
              ▲ alta
            </span>
          ) : null}
          {!resolvido && item.prioridade === "media" ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">
              ● média
            </span>
          ) : null}
          {item.prazoEm ? <PrazoBadge prazoEm={item.prazoEm} /> : null}
        </div>
        <p className="mt-0.5 text-sm text-foreground/80">{item.descricao}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!resolvido ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              prioridade
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setPrio("alta")}>
                <span className="text-red-600 dark:text-red-400">▲</span> Alta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPrio("media")}>
                <span className="text-amber-600 dark:text-amber-400">●</span>{" "}
                Média
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPrio(null)}>
                — Sem prioridade
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <RemoverAchadoButton
          funcionarioId={funcionarioId}
          achadoId={item.achadoId}
          label={item.local ?? item.descricao.slice(0, 40)}
        />
      </div>
    </li>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "amber" | "emerald";
}) {
  const toneClass =
    !active && tone === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : !active && tone === "emerald"
        ? "text-emerald-700 dark:text-emerald-300"
        : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] tracking-[0.04em] transition",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background hover:bg-muted",
        toneClass,
      )}
    >
      {label} · {count}
    </button>
  );
}
