"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useUploadInFlight } from "./upload-in-flight";

const CONCURRENCY = 3;
// Cada attempt tem 60s — coloca um teto pra requests presas em rede ruim
// (vistoria em obra com 3G), em vez de ficar pendurado pra sempre.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
// Backoff: 800ms, depois 2400ms (3x). Total no pior caso: 3 attempts +
// 2 esperas = ~63s extras, dentro do tempo que o user esta disposto a
// esperar antes de tentar de novo manualmente.
const BACKOFF_MS = [800, 2400];

type UploadOptions = {
  eventoId: string;
  uploadToken?: string;
  successLabel?: { singular: string; plural: (n: number) => string };
  onSuccess?: (count: number) => void;
};

const DEFAULT_SUCCESS = {
  singular: "Foto adicionada",
  plural: (n: number) => `${n} fotos adicionadas`,
};

type State = {
  total: number;
  done: number;
};

/**
 * Sobe N arquivos em paralelo (limite fixo), com toast unico de progresso
 * e cancelamento automatico ao desmontar.
 */
export function usePhotoUpload({
  eventoId,
  uploadToken,
  successLabel = DEFAULT_SUCCESS,
  onSuccess,
}: UploadOptions) {
  const [state, setState] = useState<State>({ total: 0, done: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const tracker = useUploadInFlight();
  // Ref pro tracker pra evitar que mudanças do contexto (count++) invalidem
  // o useCallback de upload e re-renderizem componentes no caminho crítico.
  const trackerRef = useRef(tracker);
  useEffect(() => {
    trackerRef.current = tracker;
  }, [tracker]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length === 0) return { succeeded: 0, failed: 0 };

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const url = uploadToken
        ? `/api/upload?token=${encodeURIComponent(uploadToken)}`
        : "/api/upload";

      setState({ total: list.length, done: 0 });
      trackerRef.current?.begin();
      const toastId = toast.loading(
        list.length === 1
          ? "Enviando foto..."
          : `Enviando 0 de ${list.length} fotos...`,
      );

      let succeeded = 0;
      let failed = 0;
      let cursor = 0;

      const runOne = async (file: File): Promise<void> => {
        let lastError: string | null = null;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (controller.signal.aborted) return;

          // Combina o controller geral (cancelamento por unmount) com um
          // timeout por tentativa. Qualquer um aborta a request.
          const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
          const signal = AbortSignal.any([controller.signal, timeoutSignal]);

          const fd = new FormData();
          fd.set("achadoEventoId", eventoId);
          fd.set("file", file);

          try {
            const res = await fetch(url, {
              method: "POST",
              body: fd,
              signal,
            });

            if (res.ok) {
              succeeded += 1;
              return;
            }

            // 4xx (exceto 408/429) sao erros do usuario/auth — nao tem
            // sentido retry. 5xx + 408/429 sao transientes.
            const isTransient =
              res.status >= 500 || res.status === 408 || res.status === 429;
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            lastError = data.error ?? `Falha no upload de ${file.name}`;

            if (!isTransient || attempt === MAX_ATTEMPTS - 1) {
              failed += 1;
              toast.error(lastError);
              return;
            }
            // segue pro retry com backoff
          } catch (err) {
            const error = err as Error;
            // Cancelamento por unmount: silencioso, sem retry.
            if (error.name === "AbortError" && controller.signal.aborted) {
              return;
            }
            // Timeout por tentativa OU erro de rede: ambos sao transientes
            // — vale tentar de novo.
            lastError = `Falha de rede em ${file.name}`;
            if (attempt === MAX_ATTEMPTS - 1) {
              failed += 1;
              toast.error(lastError);
              return;
            }
          }

          // Backoff antes do proximo attempt — respeita aborts no meio.
          const delay = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, delay);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                resolve();
              },
              { once: true },
            );
          });
        }
      };

      const worker = async (): Promise<void> => {
        while (cursor < list.length && !controller.signal.aborted) {
          const i = cursor++;
          await runOne(list[i]);
          setState((s) => ({ ...s, done: s.done + 1 }));
          if (list.length > 1) {
            toast.loading(
              `Enviando ${succeeded + failed} de ${list.length} fotos...`,
              { id: toastId },
            );
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, list.length) },
        () => worker(),
      );
      await Promise.all(workers);

      try {
        if (controller.signal.aborted) {
          toast.dismiss(toastId);
        } else if (succeeded > 0) {
          toast.success(
            succeeded === 1
              ? successLabel.singular
              : successLabel.plural(succeeded),
            { id: toastId },
          );
          onSuccess?.(succeeded);
        } else {
          toast.dismiss(toastId);
        }
      } finally {
        setState({ total: 0, done: 0 });
        trackerRef.current?.end();
      }

      return { succeeded, failed };
    },
    [eventoId, uploadToken, successLabel, onSuccess],
  );

  return {
    upload,
    uploading: state.total > 0,
    total: state.total,
    done: state.done,
  };
}
