"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortKey =
  | "ativos"
  | "atrasados"
  | "recentes"
  | "alfabetico"
  | "sem-vistorias";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "ativos", label: "Mais ativos primeiro" },
  { value: "atrasados", label: "Com atrasados primeiro" },
  { value: "recentes", label: "Recentes" },
  { value: "alfabetico", label: "Alfabético" },
  { value: "sem-vistorias", label: "Sem vistorias por último" },
];

type Props = {
  q: string;
  sort: SortKey;
  hideEmpty: boolean;
};

/**
 * Toolbar de filtros da listagem de empreendimentos. Estado vive na URL
 * (?q=&sort=&hideEmpty=) — shareable e sobrevive a refresh. Busca tem
 * debounce de 300ms pra evitar push spam enquanto digita.
 */
export function EmpreendimentosToolbar({ q, sort, hideEmpty }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [qLocal, setQLocal] = useState(q);
  // Re-sincroniza qLocal quando a URL muda externamente (ex: clicar em
  // paginacao ou navegar com back). Pattern oficial do React de "store
  // information from previous renders" — sem useEffect.
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setQLocal(q);
  }

  const updateParams = (
    next: Partial<{ q: string; sort: SortKey; hideEmpty: boolean }>,
  ) => {
    const params = new URLSearchParams(searchParams);

    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
      params.delete("page");
    }
    if (next.sort !== undefined) {
      if (next.sort === "ativos") params.delete("sort");
      else params.set("sort", next.sort);
      params.delete("page");
    }
    if (next.hideEmpty !== undefined) {
      if (next.hideEmpty) params.set("hideEmpty", "1");
      else params.delete("hideEmpty");
      params.delete("page");
    }
    start(() => {
      const queryString = params.toString();
      router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, {
        scroll: false,
      });
    });
  };

  // Debounce no input de busca — agenda push da URL 300ms depois de
  // parar de digitar. Single effect com dep so em qLocal/q evita
  // rerenders cascateados (lint set-state-in-effect ok porque so
  // chama updateParams, nao setState).
  useEffect(() => {
    if (qLocal === q) return;
    const timer = setTimeout(() => {
      updateParams({ q: qLocal });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal, q]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border bg-card p-2",
        pending && "opacity-80",
      )}
    >
      <label className="flex flex-1 min-w-[180px] items-center gap-2 rounded-md border border-border bg-background/50 px-2.5 py-1.5">
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={qLocal}
          onChange={(e) => setQLocal(e.target.value)}
          placeholder="Buscar empreendimento ou cliente..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Buscar"
        />
        {qLocal ? (
          <button
            type="button"
            onClick={() => setQLocal("")}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Limpar busca"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </label>

      <span aria-hidden className="h-5 w-px bg-border" />

      <select
        value={sort}
        onChange={(e) => updateParams({ sort: e.target.value as SortKey })}
        className="rounded-md border border-border bg-card px-2 py-1 font-mono text-xs text-foreground"
        aria-label="Ordenar"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "relative inline-block h-3.5 w-6 rounded-full transition-colors",
            hideEmpty ? "bg-brand" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-2.5 rounded-full bg-white transition-all",
              hideEmpty ? "left-3" : "left-0.5",
            )}
          />
        </span>
        <input
          type="checkbox"
          checked={hideEmpty}
          onChange={(e) => updateParams({ hideEmpty: e.target.checked })}
          className="sr-only"
        />
        Esconder sem atividade
      </label>
    </div>
  );
}
