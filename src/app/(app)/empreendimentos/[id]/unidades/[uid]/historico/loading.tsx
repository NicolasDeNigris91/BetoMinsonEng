import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da timeline: breadcrumb, titulo, lista de items em forma de
// linha vertical com bullets.
export default function Loading() {
  return (
    <div
      className="space-y-6 py-2"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <span className="sr-only">Carregando…</span>

      <Skeleton className="h-4 w-80" />

      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <ol className="relative ml-3 space-y-4 border-l-2 border-dashed border-border/70 pl-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="relative">
            <span className="absolute top-1.5 -left-[33px] flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted" />
            <div className="rounded-md border bg-card p-3 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-40" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
