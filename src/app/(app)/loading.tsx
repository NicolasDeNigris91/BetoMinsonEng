import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="flex items-center justify-center py-24 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
