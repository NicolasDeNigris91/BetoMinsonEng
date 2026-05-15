import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da listagem de empreendimentos. Espelha layout: header com
// titulo + botao, grade de cards 1/2/3 colunas.
export default function Loading() {
  return (
    <div
      className="space-y-6 py-2"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <span className="sr-only">Carregando…</span>

      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border bg-card p-4 shadow-sm space-y-3"
          >
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
