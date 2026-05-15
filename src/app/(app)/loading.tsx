import { Skeleton } from "@/components/ui/skeleton";

// Skeleton genérico p/ todas as rotas dentro de (app). Mostra um cabeçalho
// + grade de cards — formato comum em listagens (empreendimentos, unidades,
// vistorias). Em telas que não são listagens, ainda funciona como
// placeholder neutro até o conteúdo real chegar.
export default function Loading() {
  return (
    <div
      className="space-y-6 py-2"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <span className="sr-only">Carregando…</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border bg-card p-4 shadow-sm space-y-3"
          >
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="pt-1">
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
