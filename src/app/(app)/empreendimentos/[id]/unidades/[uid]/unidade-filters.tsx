"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import {
  CATEGORIA_LABELS,
  categoriaEnum,
  type Categoria,
} from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

export type StatusFilter = "todos" | "aberto" | "atrasado" | "resolvido";

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "aberto", label: "Em aberto" },
  { value: "atrasado", label: "Atrasado" },
  { value: "resolvido", label: "Resolvido" },
];

type Props = {
  /** Categorias presentes na unidade — chips so aparecem pras existentes. */
  categoriasPresentes: Categoria[];
  /** Contagem total de achados por categoria, exibida ao lado do nome. */
  totaisPorCategoria: Record<Categoria, number>;
  /** Estado atual lido dos searchParams pelo server. */
  selectedCategorias: Categoria[];
  selectedStatus: StatusFilter;
  /** Quantos achados batem com o filtro atual — exibido ao lado do "Limpar". */
  matchCount: number;
  totalCount: number;
};

/**
 * Barra de filtros da pagina da unidade: chips toggle por categoria (multi)
 * + pill exclusivo de status. Estado vive na URL (?cat=...&status=...)
 * pra ficar shareable e sobreviver a refresh.
 */
export function UnidadeFilters({
  categoriasPresentes,
  totaisPorCategoria,
  selectedCategorias,
  selectedStatus,
  matchCount,
  totalCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  const update = (next: { cat?: Categoria[]; status?: StatusFilter }) => {
    const params = new URLSearchParams(searchParams);
    if (next.cat !== undefined) {
      if (next.cat.length === 0) params.delete("cat");
      else params.set("cat", next.cat.join(","));
    }
    if (next.status !== undefined) {
      if (next.status === "todos") params.delete("status");
      else params.set("status", next.status);
    }
    start(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const toggleCategoria = (cat: Categoria) => {
    const isSelected = selectedCategorias.includes(cat);
    const next = isSelected
      ? selectedCategorias.filter((c) => c !== cat)
      : [...selectedCategorias, cat];
    update({ cat: next });
  };

  const setStatus = (status: StatusFilter) => {
    if (status === selectedStatus) return;
    update({ status });
  };

  const hasFilter = selectedCategorias.length > 0 || selectedStatus !== "todos";

  const clear = () => {
    start(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  if (categoriasPresentes.length === 0) return null;

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border bg-card p-3",
        pending && "opacity-70",
      )}
      data-pending={pending || undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          Matéria
        </span>
        {categoriaEnum.enumValues
          .filter((c) => categoriasPresentes.includes(c))
          .map((cat) => {
            const active = selectedCategorias.includes(cat);
            const n = totaisPorCategoria[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategoria(cat)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
                  active
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    CATEGORIA_DOT[cat],
                  )}
                />
                {CATEGORIA_LABELS[cat]}
                <span className="font-semibold tabular-nums">
                  {String(n).padStart(2, "0")}
                </span>
              </button>
            );
          })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          Status
        </span>
        <div
          role="radiogroup"
          aria-label="Filtro de status"
          className="inline-flex rounded-full border bg-card p-0.5"
        >
          {STATUS_FILTERS.map((s) => {
            const active = selectedStatus === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStatus(s.value)}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {hasFilter ? (
          <button
            type="button"
            onClick={clear}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            Limpar
          </button>
        ) : null}
      </div>

      {hasFilter ? (
        <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
          mostrando <span className="tabular-nums text-foreground">{matchCount}</span>{" "}
          de <span className="tabular-nums">{totalCount}</span>{" "}
          {totalCount === 1 ? "achado" : "achados"}
        </p>
      ) : null}
    </div>
  );
}
