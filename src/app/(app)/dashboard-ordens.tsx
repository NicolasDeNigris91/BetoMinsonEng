import Link from "next/link";
import { HardHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrazoBadge } from "@/components/prazo-badge";
import type { OrdemEmAndamento } from "./dashboard-data";

type Props = {
  ordens: OrdemEmAndamento[];
};

const STATUS_LABEL: Record<OrdemEmAndamento["status"], string> = {
  concluido: "Concluído",
  em_servico: "Em serviço",
  aguardando: "Aguardando",
};

const STATUS_CLASS: Record<OrdemEmAndamento["status"], string> = {
  concluido:
    "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
  em_servico:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  aguardando:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const BAR_FG: Record<OrdemEmAndamento["status"], string> = {
  concluido: "bg-emerald-500 dark:bg-emerald-400",
  em_servico: "bg-emerald-500 dark:bg-emerald-400",
  aguardando: "bg-gray-300 dark:bg-gray-600",
};

export function DashboardOrdens({ ordens }: Props) {
  if (ordens.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
        Nenhuma ordem com link ativo. Gere um link de profissional num escopo
        pra acompanhar aqui.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <ul className="dashboard-scroll divide-y divide-dashed divide-border/70 max-h-[320px] overflow-y-auto">
        {ordens.map((o) => (
          <li key={o.escopoId}>
            <OrdemRow ordem={o} />
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-b from-card/0 to-card"
      />
    </div>
  );
}

function OrdemRow({ ordem }: { ordem: OrdemEmAndamento }) {
  const percent =
    ordem.total > 0
      ? Math.round((ordem.resolvidos / ordem.total) * 100)
      : 0;
  return (
    <Link
      href={`/empreendimentos/${ordem.empreendimentoId}/escopos/${ordem.escopoId}`}
      className="grid grid-cols-1 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 md:grid-cols-[1fr_auto_auto]"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HardHat className="size-3.5 text-brand shrink-0" aria-hidden />
          <span className="truncate">{ordem.escopoNome}</span>
          {ordem.prazoEm ? (
            <PrazoBadge
              prazoEm={ordem.prazoEm}
              resolvido={ordem.status === "concluido"}
              className="shrink-0"
            />
          ) : null}
        </p>
        <p className="mt-0.5 font-mono text-[10px] tracking-[0.04em] text-muted-foreground/70">
          {ordem.empreendimentoNome}
          {ordem.nUnidades > 0 ? (
            <>
              {" · "}
              <span className="tabular-nums">
                {String(ordem.nUnidades).padStart(2, "0")}
              </span>{" "}
              {ordem.nUnidades === 1 ? "unidade" : "unidades"}
            </>
          ) : null}
          {ordem.persistencias > 0 ? (
            <>
              {" · "}
              <span className="text-amber-700 dark:text-amber-300">
                {ordem.persistencias} persiste
                {ordem.persistencias === 1 ? "" : "ncias"}
              </span>
            </>
          ) : null}
          {ordem.ultimaAcaoAt ? (
            <>
              {" · última ação "}
              <span>{relativeTime(ordem.ultimaAcaoAt)}</span>
            </>
          ) : (
            <> · sem atividade ainda</>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 md:w-44">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full transition-all", BAR_FG[ordem.status])}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {String(ordem.resolvidos).padStart(2, "0")}/
          {String(ordem.total).padStart(2, "0")}
        </span>
      </div>

      <span
        className={cn(
          "justify-self-end rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase",
          STATUS_CLASS[ordem.status],
        )}
      >
        {STATUS_LABEL[ordem.status]}
      </span>
    </Link>
  );
}

function relativeTime(dateISO: string): string {
  const t = Date.parse(dateISO);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `há ${w} sem`;
  const m = Math.floor(d / 30);
  return `há ${m} ${m === 1 ? "mês" : "meses"}`;
}
