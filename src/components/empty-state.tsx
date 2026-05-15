import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  eyebrow: string;
  description: string;
  action?: React.ReactNode;
};

/**
 * Estado vazio com grid blueprint marcante + icone em borda tracejada.
 * Doc identidade: "empty state com bp-grid-strong + icone tecnico".
 */
export function EmptyState({ icon: Icon, eyebrow, description, action }: Props) {
  return (
    <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
          <Icon className="size-9 text-muted-foreground/60" aria-hidden />
        </div>
        <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          {eyebrow}
        </p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {description}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
