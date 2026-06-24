"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useUploadInFlight } from "./upload-in-flight";

const CONCURRENCY = 3;
// Teto pra request presa em rede ruim (3G de obra).
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
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

export function usePhotoUpload({
  eventoId,
  uploadToken,
  successLabel = DEFAULT_SUCCESS,
  onSuccess,
}: UploadOptions) {
  const [state, setState] = useState<State>({ total: 0, done: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const tracker = useUploadInFlight();
  // Ref evita que count++ invalide o useCallback de upload.
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

            // 4xx (exceto 408/429) sao erro do usuario; nao retry.
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
          } catch (err) {
            const error = err as Error;
            if (error.name === "AbortError" && controller.signal.aborted) {
              return;
            }
            lastError = `Falha de rede em ${file.name}`;
            if (attempt === MAX_ATTEMPTS - 1) {
              failed += 1;
              toast.error(lastError);
              return;
            }
          }

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
