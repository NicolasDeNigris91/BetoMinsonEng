import Link from "next/link";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

export type EmpreendimentoCardView = {
  id: string;
  nome: string;
  cliente: string | null;
  endereco: string | null;
  nUnidades: number;
  nAbertos: number;
  nResolvidos: number;
  nAtrasados: number;
  /** Map categoria -> quantos abertos. Quando 0, render como 'ok'. */
  abertosPorCategoria: Record<Categoria, number>;
  /** Data ISO da ultima atividade (string ISO timestamp). */
  ultimaAtividadeISO: string | null;
};

const ORDEM_CATEGORIA: Categoria[] = [
  "ELE",
  "HID",
  "HVAC",
  "PISCINA",
  "ASP",
  "SIS",
];

// Stale = sem atividade ha mais que isso, ja tinha aberto.
const INATIVO_DIAS_THRESHOLD = 60;

type StatusKind = "urgente" | "ativo" | "ok" | "inativo" | "vazio";

type StatusInfo = {
  kind: StatusKind;
  stripeClass: string;
  badgeLabel: string;
  badgeClass: string;
};

function evaluateStatus(view: EmpreendimentoCardView): StatusInfo {
  // Sem unidades ainda: novo empreendimento, mostra como vazio.
  if (view.nUnidades === 0) {
    return {
      kind: "vazio",
      stripeClass: "bg-gradient-to-b from-slate-300 to-slate-400",
      badgeLabel: "novo",
      badgeClass:
        "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
    };
  }

  // Atrasado: sempre o pior estado, ignora atividade.
  if (view.nAtrasados > 0) {
    return {
      kind: "urgente",
      stripeClass: "bg-gradient-to-b from-red-400 to-red-600",
      badgeLabel: "⚠ urgente",
      badgeClass:
        "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200",
    };
  }

  // Sem abertos com vistorias: tudo resolvido.
  if (view.nAbertos === 0) {
    if (view.ultimaAtividadeISO) {
      return {
        kind: "ok",
        stripeClass: "bg-gradient-to-b from-emerald-400 to-emerald-600",
        badgeLabel: "sem abertos",
        badgeClass:
          "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
      };
    }
    return {
      kind: "vazio",
      stripeClass: "bg-gradient-to-b from-slate-300 to-slate-400",
      badgeLabel: "sem vistorias",
      badgeClass:
        "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
    };
  }

  // Tem abertos: checa se a ultima atividade e antiga (inativo).
  if (view.ultimaAtividadeISO) {
    const dias = daysSince(view.ultimaAtividadeISO);
    if (dias > INATIVO_DIAS_THRESHOLD) {
      return {
        kind: "inativo",
        stripeClass: "bg-gradient-to-b from-slate-400 to-slate-600",
        badgeLabel: "inativo",
        badgeClass:
          "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
      };
    }
  }

  // Caso comum: tem abertos, ativo recentemente.
  return {
    kind: "ativo",
    stripeClass: "bg-gradient-to-b from-amber-400 to-amber-600",
    badgeLabel: "ativo",
    badgeClass:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  };
}

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function relativeActivity(iso: string | null): string {
  if (!iso) return "sem vistorias";
  const d = daysSince(iso);
  if (d <= 0) return "ativo · hoje";
  if (d === 1) return "ativo · ontem";
  if (d < 7) return `ativo · há ${d}d`;
  if (d < 30) return `ativo · há ${d} dias`;
  if (d < 60) return `ativo · há ${Math.floor(d / 7)} sem`;
  const meses = Math.floor(d / 30);
  return `parado · há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

type Props = {
  view: EmpreendimentoCardView;
};

/**
 * Card de empreendimento com info densa: status semantico, stripe pulsando
 * em vermelho quando urgente, distribuicao por materia, atividade relativa
 * e atrasados em destaque.
 */
export function EmpreendimentoCard({ view }: Props) {
  const status = evaluateStatus(view);
  const isEmpty = status.kind === "vazio" && view.nUnidades === 0;

  return (
    <Link
      href={`/empreendimentos/${view.id}`}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={cn(
          "relative h-full overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md",
          isEmpty && "border-dashed bg-card/70",
        )}
      >
        <div
          aria-hidden
          className={cn("absolute top-0 bottom-0 left-0 w-1", status.stripeClass)}
        />

        <span
          className={cn(
            "absolute top-3 right-3 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] uppercase",
            status.badgeClass,
          )}
        >
          {status.badgeLabel}
        </span>

        <div className="space-y-1 px-5 pt-4 pb-2 pr-24">
          <p className="text-base font-bold tracking-tight">{view.nome}</p>
          {view.cliente ? (
            <p className="text-sm text-muted-foreground">{view.cliente}</p>
          ) : null}
          {view.endereco ? (
            <p className="line-clamp-1 text-xs text-muted-foreground/70">
              {view.endereco}
            </p>
          ) : null}
        </div>

        {isEmpty ? (
          <EmptyBody />
        ) : (
          <>
            <CategoriaChips
              abertosPorCategoria={view.abertosPorCategoria}
              hasAchados={view.nAbertos + view.nResolvidos > 0}
            />

            <ActivityRow
              ultimaAtividadeISO={view.ultimaAtividadeISO}
              nUnidades={view.nUnidades}
              stale={status.kind === "inativo"}
            />

            {status.kind === "inativo" ? <InactiveWarning /> : null}

            <Footer view={view} />
          </>
        )}
      </div>
    </Link>
  );
}

function EmptyBody() {
  return (
    <div className="flex flex-col gap-2 px-5 pt-2 pb-4">
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-md border border-dashed border-brand/40 bg-brand/5 text-brand"
      >
        ▢
      </span>
      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">Sem unidades cadastradas.</strong>
        <br />
        Adicione as primeiras pra começar a registrar vistorias.
      </p>
    </div>
  );
}

function CategoriaChips({
  abertosPorCategoria,
  hasAchados,
}: {
  abertosPorCategoria: Record<Categoria, number>;
  hasAchados: boolean;
}) {
  if (!hasAchados) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border/70 px-5 py-2">
      {ORDEM_CATEGORIA.map((cat) => {
        const n = abertosPorCategoria[cat] ?? 0;
        const label = CATEGORIA_LABELS[cat].toLowerCase();
        if (n === 0) {
          // Esconde categorias zeradas pra nao poluir — modo "high-signal".
          // Hoje a regra antiga mostrava tudo. Aqui prefiro ver so o que tem.
          return null;
        }
        return (
          <span
            key={cat}
            className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.04em]"
          >
            <span
              aria-hidden
              className={cn("inline-block size-1.5 rounded-full", CATEGORIA_DOT[cat])}
            />
            <span className="text-muted-foreground">{label}</span>
            <span className="font-bold text-amber-700 tabular-nums dark:text-amber-300">
              {String(n).padStart(2, "0")}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ActivityRow({
  ultimaAtividadeISO,
  nUnidades,
  stale,
}: {
  ultimaAtividadeISO: string | null;
  nUnidades: number;
  stale: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-dashed border-border/70 px-5 py-1.5 font-mono text-[10px] tracking-[0.04em] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            stale ? "bg-slate-400" : "bg-emerald-500 animate-pulse",
          )}
        />
        <span className="text-foreground/80">
          {relativeActivity(ultimaAtividadeISO)}
        </span>
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
        {String(nUnidades).padStart(2, "0")}{" "}
        {nUnidades === 1 ? "unidade" : "unidades"}
      </span>
    </div>
  );
}

function InactiveWarning() {
  return (
    <p className="flex items-center gap-2 border-t border-b border-dashed border-amber-400/50 bg-amber-100/40 px-5 py-1.5 text-[11px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
      <span aria-hidden>⏰</span>
      <span>
        Sem vistorias recentes.{" "}
        <strong className="font-semibold">Agendar nova?</strong>
      </span>
    </p>
  );
}

function Footer({ view }: { view: EmpreendimentoCardView }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 font-mono text-[10px] tracking-[0.06em]">
      <span className="flex flex-wrap gap-x-3 text-muted-foreground">
        <span>
          <span
            className={cn(
              "tabular-nums font-bold",
              view.nAbertos > 0
                ? "text-amber-700 dark:text-amber-300"
                : "text-foreground",
            )}
          >
            {String(view.nAbertos).padStart(2, "0")}
          </span>{" "}
          abertos
        </span>
        {view.nResolvidos > 0 ? (
          <span>
            <span className="tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
              {String(view.nResolvidos).padStart(2, "0")}
            </span>{" "}
            resolvidos
          </span>
        ) : null}
      </span>
      {view.nAtrasados > 0 ? (
        <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.06em] uppercase text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
          ▲ {view.nAtrasados} {view.nAtrasados === 1 ? "atrasado" : "atrasados"}
        </span>
      ) : null}
    </div>
  );
}
