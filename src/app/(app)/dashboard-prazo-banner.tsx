"use client";

import { useState, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATEGORIA_LABELS } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { isNextRedirectError } from "@/lib/next-errors";
import { setPrazosLoteAction } from "./dashboard-actions";
import type { AchadoSemPrazo } from "./dashboard-data";

const DISMISS_KEY = "dashboard-banner-sem-prazo-dismiss-until";
const DISMISS_DAYS = 7;

type Props = {
  totalAbertos: number;
  totalSemPrazo: number;
  achadosSemPrazo: AchadoSemPrazo[];
};

/**
 * Pequena store que notifica quando localStorage muda (mesma aba ou
 * outras). useSyncExternalStore le sem precisar de useEffect, mantendo a
 * pureza do render.
 */
function subscribeDismiss(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === DISMISS_KEY || e.key === null) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function readIsDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const n = Number(raw);
  if (!Number.isFinite(n)) return false;
  return n > Date.now();
}

/**
 * Banner do dashboard que alerta sobre achados sem prazo definido. Pode
 * ser dispensado por 7 dias (localStorage) e abre modal de definicao em
 * lote pra resolver todos de uma vez. Reaparece automaticamente quando
 * a fatia muda significativamente ou o cookie expira.
 */
export function DashboardPrazoBanner({
  totalAbertos,
  totalSemPrazo,
  achadosSemPrazo,
}: Props) {
  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    readIsDismissed,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [revealedAfterDismiss, setRevealedAfterDismiss] = useState(false);

  const isDismissed = dismissed && !revealedAfterDismiss;

  // Sem nenhum achado sem prazo: nao tem o que mostrar.
  if (totalSemPrazo === 0) return null;

  // Se dispensado, mostra um aviso bem fininho com link pra reabrir.
  if (isDismissed) {
    return (
      <button
        type="button"
        onClick={() => setRevealedAfterDismiss(true)}
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-dashed border-amber-300 bg-amber-50/30 px-2 py-1 font-mono text-[10px] tracking-[0.06em] uppercase text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-300 dark:hover:bg-amber-900/20"
        aria-label="Reabrir aviso de achados sem prazo"
      >
        <AlertTriangle className="size-3" />
        {totalSemPrazo} sem prazo (avisos ocultos)
      </button>
    );
  }

  const dismissBanner = () => {
    if (typeof window === "undefined") return;
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(DISMISS_KEY, String(until));
    setRevealedAfterDismiss(false);
    // Força re-render pra esconder.
    window.dispatchEvent(new StorageEvent("storage", { key: DISMISS_KEY }));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
        <AlertTriangle
          className="size-4 shrink-0 text-amber-700 dark:text-amber-300"
          aria-hidden
        />
        <p className="flex-1 text-amber-900 dark:text-amber-200">
          Existem <strong>{totalSemPrazo}</strong>{" "}
          {totalSemPrazo === 1 ? "achado em aberto" : "achados em aberto"} sem
          prazo definido. Defina prazos pra priorizar o que cobrar primeiro.
          {totalSemPrazo < totalAbertos ? (
            <span className="ml-1 font-mono text-[10px] tracking-[0.04em] text-amber-700/70 dark:text-amber-300/70">
              ({totalAbertos - totalSemPrazo} com prazo · {totalSemPrazo} sem)
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.04em] text-white transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          Definir prazos
          <span aria-hidden>→</span>
        </button>
        <button
          type="button"
          onClick={dismissBanner}
          className="rounded-md p-1 text-amber-700/70 transition-colors hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300/70 dark:hover:bg-amber-900/40 dark:hover:text-amber-200"
          aria-label={`Dispensar aviso por ${DISMISS_DAYS} dias`}
          title={`Dispensar por ${DISMISS_DAYS} dias`}
        >
          <X className="size-4" />
        </button>
      </div>

      <DefinirPrazosDialog
        open={open}
        onOpenChange={setOpen}
        achados={achadosSemPrazo}
        totalSemPrazo={totalSemPrazo}
      />
    </>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function DefinirPrazosDialog({
  open,
  onOpenChange,
  achados,
  totalSemPrazo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  achados: AchadoSemPrazo[];
  totalSemPrazo: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [prazos, setPrazos] = useState<Record<string, string>>({});

  const setOne = (id: string, value: string) => {
    setPrazos((p) => ({ ...p, [id]: value }));
  };

  // Atalhos: aplica uma data sugerida em todos que ainda nao tem prazo
  // no formulario. Nao sobrescreve o que o usuario ja preencheu manual.
  const applyShortcut = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const iso = d.toISOString().slice(0, 10);
    setPrazos((p) => {
      const next = { ...p };
      for (const a of achados) {
        if (!next[a.id]) next[a.id] = iso;
      }
      return next;
    });
  };

  const itensComPrazo = achados.filter((a) => prazos[a.id]);
  const canSubmit = itensComPrazo.length > 0 && !pending;

  const handleSubmit = () => {
    start(async () => {
      try {
        const result = await setPrazosLoteAction(
          itensComPrazo.map((a) => ({
            achadoId: a.id,
            prazoEm: prazos[a.id],
          })),
        );
        toast.success(
          `Prazo definido em ${result.updated} ${result.updated === 1 ? "achado" : "achados"}.`,
        );
        onOpenChange(false);
        setPrazos({});
        router.refresh();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Definir prazos em lote</DialogTitle>
          <DialogDescription>
            {achados.length < totalSemPrazo
              ? `Mostrando os primeiros ${achados.length} de ${totalSemPrazo} achados sem prazo.`
              : `${achados.length} ${achados.length === 1 ? "achado" : "achados"} sem prazo.`}{" "}
            Preencha só os que quiser ou use um atalho.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            Aplicar a todos:
          </span>
          {[
            { label: "+7 dias", days: 7 },
            { label: "+15 dias", days: 15 },
            { label: "+30 dias", days: 30 },
            { label: "+60 dias", days: 60 },
          ].map((s) => (
            <button
              key={s.days}
              type="button"
              onClick={() => applyShortcut(s.days)}
              disabled={pending}
              className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>

        <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
          {achados.map((a) => {
            const value = prazos[a.id] ?? "";
            const hasPrazo = Boolean(value);
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border bg-card p-3 transition-colors",
                  hasPrazo && "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-900/10",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 inline-block size-2 shrink-0 rounded-full",
                    CATEGORIA_DOT[a.categoria],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
                      {CATEGORIA_LABELS[a.categoria]}
                    </span>
                    {a.local ? (
                      <span className="font-semibold">{a.local}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-foreground/85">
                    {a.descricao}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-[0.04em] text-muted-foreground/70">
                    {a.empreendimentoNome} · {a.unidadeNome}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    type="date"
                    value={value}
                    min={todayISO()}
                    onChange={(e) => setOne(a.id, e.target.value)}
                    disabled={pending}
                    className="h-8 rounded-md border bg-background px-2 font-mono text-xs"
                    aria-label={`Prazo do achado ${a.local ?? a.descricao}`}
                  />
                  {hasPrazo ? (
                    <button
                      type="button"
                      onClick={() => setOne(a.id, "")}
                      disabled={pending}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Limpar prazo"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <p className="mr-auto self-center font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
            {itensComPrazo.length} {itensComPrazo.length === 1 ? "achado pronto" : "achados prontos"}
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            <Check className="mr-1.5 size-4" />
            {pending
              ? "Salvando..."
              : itensComPrazo.length === 0
                ? "Salvar"
                : `Salvar ${itensComPrazo.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
