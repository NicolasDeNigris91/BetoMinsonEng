"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { isNextRedirectError } from "@/lib/next-errors";
import { updateObservacoesAction } from "./actions";

const DEBOUNCE_MS = 1000;

export function ObservacoesField({
  vistoriaId,
  initial,
  editable,
}: {
  vistoriaId: string;
  initial: string;
  editable: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== savedValue;

  // Refs pra ler estado mais recente dentro de timers/closures sem
  // re-criar o callback de save (que invalidaria o debounce).
  const valueRef = useRef(value);
  const savedValueRef = useRef(savedValue);
  const pendingRef = useRef(pending);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    savedValueRef.current = savedValue;
  }, [savedValue]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Se ja ha um save em voo, deixa ele terminar — o effect abaixo
    // dispara outro flush quando pending volta a false (se ainda dirty).
    if (pendingRef.current) return;
    const snapshot = valueRef.current;
    if (snapshot === savedValueRef.current) return;

    start(async () => {
      try {
        const fd = new FormData();
        fd.set("observacoesGerais", snapshot);
        const result = await updateObservacoesAction(vistoriaId, fd);
        if (result?.error) {
          toast.error(result.error);
          // mantem dirty=true → proximo onChange/blur agenda novo save
          return;
        }
        setSavedValue(snapshot);
        setLastSavedAt(new Date());
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao salvar. Tente novamente.");
        // mantem dirty=true → proximo onChange/blur agenda novo save
      }
    });
  }, [vistoriaId]);

  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(flush, DEBOUNCE_MS);
  }, [flush]);

  // Quando um save termina e ainda há diff (user digitou no meio), dispara
  // o proximo. Reagendamento (debounce) em vez de imediato pra agrupar
  // teclas que vierem na sequencia.
  useEffect(() => {
    if (pending) return;
    if (dirty) scheduleSave();
  }, [pending, dirty, scheduleSave]);

  // Cleanup + warning de unsaved no fechamento da aba.
  useEffect(() => {
    if (!dirty && !pending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, pending]);

  // Cleanup do timer no unmount pra evitar save zumbi.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (!editable) {
    if (!initial) return null;
    return (
      <div className="space-y-2">
        <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
          Observações gerais
        </h2>
        <p className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-line">
          {initial}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="observacoesGerais"
          className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80"
        >
          Observações gerais
        </label>
        <SaveStatus
          pending={pending}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
        />
      </div>
      <Textarea
        id="observacoesGerais"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave();
        }}
        onBlur={flush}
        rows={3}
        placeholder="Notas gerais sobre esta vistoria..."
      />
    </div>
  );
}

function SaveStatus({
  pending,
  dirty,
  lastSavedAt,
}: {
  pending: boolean;
  dirty: boolean;
  lastSavedAt: Date | null;
}) {
  let text: string | null = null;
  let tone = "text-muted-foreground/70";

  if (pending) {
    text = "Salvando…";
  } else if (dirty) {
    text = "Não salvo";
    tone = "text-amber-700 dark:text-amber-300";
  } else if (lastSavedAt) {
    text = `Salvo · ${formatHHMM(lastSavedAt)}`;
  }

  if (!text) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`font-mono text-[10px] tracking-[0.18em] uppercase ${tone}`}
    >
      {text}
    </span>
  );
}

function formatHHMM(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
