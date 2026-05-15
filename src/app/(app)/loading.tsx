import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da home (dashboard /). Espelha o layout real: 4 stat cards no
// topo, duas colunas (proximas pendencias + tempo medio). Aplicado tambem
// como fallback raiz das outras rotas que nao tem loading.tsx proprio.
export default function Loading() {
  return (
    <div
      className="space-y-8 py-2"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <span className="sr-only">Carregando…</span>

      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-44" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card px-4 py-3 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-md border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="ml-auto h-4 w-20" />
                  </div>
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
