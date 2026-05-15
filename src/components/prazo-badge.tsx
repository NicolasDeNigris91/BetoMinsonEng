import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluatePrazo } from "@/lib/format";

type Props = {
  prazoEm: string | null | undefined;
  /** Em achados resolvidos o prazo nao deve pintar vermelho — fica apenas
   *  informativo (cinza). Default: false. */
  resolvido?: boolean;
  className?: string;
};

/**
 * Badge inline pra prazo de achado:
 *   - atrasado → vermelho, mostra "atrasado há Xd"
 *   - hoje → laranja, mostra "vence hoje"
 *   - proximo (<=7d) → ambar, mostra "vence em Xd"
 *   - futuro → cinza, mostra "prazo DD/MM"
 * Se achado ja resolvido, sempre cinza.
 */
export function PrazoBadge({ prazoEm, resolvido = false, className }: Props) {
  const state = evaluatePrazo(prazoEm);
  if (!state) return null;

  if (resolvido) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground",
          className,
        )}
      >
        <Clock className="size-3" aria-hidden />
        {state.texto}
      </span>
    );
  }

  const variant =
    state.kind === "atrasado"
      ? "border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
      : state.kind === "hoje"
        ? "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
        : state.kind === "proximo"
          ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          : "border-border bg-muted text-muted-foreground";

  const Icon = state.kind === "atrasado" || state.kind === "hoje" ? AlertTriangle : Clock;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em] uppercase",
        variant,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {state.texto}
    </span>
  );
}
