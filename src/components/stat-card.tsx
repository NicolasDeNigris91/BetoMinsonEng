import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  /** Pinta o valor na cor de marca (papaya) — usar pra destacar metrica chave. */
  accent?: boolean;
  /** Padding zero a esquerda — visual de odometro. */
  padZero?: boolean;
};

/**
 * Card de metrica: label mono caps + valor grande em mono tabular-nums.
 * Item 5 da identidade visual (docs/identidade-visual.md).
 */
export function StatCard({ label, value, accent, padZero = true }: Props) {
  const display = padZero ? String(value).padStart(2, "0") : String(value);

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-[28px] font-bold tabular-nums leading-none",
          accent ? "text-brand" : "text-foreground",
        )}
      >
        {display}
      </p>
    </div>
  );
}
