import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da pagina da unidade: breadcrumb, titulo + acoes, 3 stat cards,
// barra de filtros, lista de cards de vistoria.
export default function Loading() {
  return (
    <div
      className="space-y-6 py-2"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <span className="sr-only">Carregando…</span>

      <Skeleton className="h-4 w-72" />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-60" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card px-4 py-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-10" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-4 w-12" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-6 w-64 rounded-full" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card px-5 py-4 space-y-3">
              <Skeleton className="h-5 w-48" />
              <div className="flex gap-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-3 w-16" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
