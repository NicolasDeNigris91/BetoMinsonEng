import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "danger" | "warning" | "success";

type Props = {
  label: string;
  value: number;
  /** Cor do valor. 'accent' = papaya (compat com prop `accent` antigo). */
  tone?: Tone;
  /** Compat com chamadas antigas — equivalente a tone='accent'. */
  accent?: boolean;
  /** Padding zero a esquerda — visual de odometro. Default true. */
  padZero?: boolean;
  /** Texto fininho abaixo do valor: contexto extra ("prazo vencido",
   *  "vistorias nao-finalizadas"...). */
  sublabel?: string;
  /** Variacao numerica vs periodo anterior. Mostra um badge "+3" verde,
   *  vermelho ou cinza. 0 vira "=". Se omitido, nao mostra nada. */
  delta?: number;
  /** Quando true, delta positivo eh "bom" (verde). Default false:
   *  delta positivo eh "ruim" (vermelho) — caso "em aberto", "atrasados". */
  positiveIsGood?: boolean;
};

/**
 * Card de metrica: label mono caps + valor grande em mono tabular-nums,
 * opcional badge de delta vs periodo anterior e sublabel descritivo.
 */
export function StatCard({
  label,
  value,
  tone,
  accent,
  padZero = true,
  sublabel,
  delta,
  positiveIsGood = false,
}: Props) {
  const display = padZero ? String(value).padStart(2, "0") : String(value);
  const effectiveTone: Tone = tone ?? (accent ? "accent" : "default");

  const toneClass: Record<Tone, string> = {
    default: "text-foreground",
    accent: "text-brand",
    danger: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
  };

  return (
    <div className="border bg-card px-4 py-3">
      <p className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
        <span>{label}</span>
        {delta != null ? <DeltaBadge delta={delta} positiveIsGood={positiveIsGood} /> : null}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-[28px] font-bold tabular-nums leading-none",
          toneClass[effectiveTone],
        )}
      >
        {display}
      </p>
      {sublabel ? (
        <p className="mt-1 font-mono text-[10px] tracking-[0.04em] text-muted-foreground/70">
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}

function DeltaBadge({
  delta,
  positiveIsGood,
}: {
  delta: number;
  positiveIsGood: boolean;
}) {
  // 0 = neutro (cinza). Positivo: vermelho se ruim (default), verde se bom.
  let cls: string;
  let txt: string;
  if (delta === 0) {
    cls = "bg-muted text-muted-foreground";
    txt = "=";
  } else {
    const isGood = positiveIsGood ? delta > 0 : delta < 0;
    cls = isGood
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    txt = `${delta > 0 ? "+" : ""}${delta}`;
  }
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-tight",
        cls,
      )}
    >
      {txt}
    </span>
  );
}
