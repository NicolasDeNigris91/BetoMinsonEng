"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const CONCURRENCY = 3;

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
      const toastId = toast.loading(
        list.length === 1
          ? "Enviando foto..."
          : `Enviando 0 de ${list.length} fotos...`,
      );

      let succeeded = 0;
      let failed = 0;
      let cursor = 0;

      const runOne = async (file: File): Promise<void> => {
        const fd = new FormData();
        fd.set("achadoEventoId", eventoId);
        fd.set("file", file);
        try {
          const res = await fetch(url, {
            method: "POST",
            body: fd,
            signal: controller.signal,
          });
          if (res.ok) {
            succeeded += 1;
          } else {
            failed += 1;
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            toast.error(data.error ?? `Falha no upload de ${file.name}`);
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            // silent
          } else {
            failed += 1;
            toast.error(`Falha no upload de ${file.name}`);
          }
        } finally {
          setState((s) => ({ ...s, done: s.done + 1 }));
          if (list.length > 1) {
            toast.loading(
              `Enviando ${succeeded + failed} de ${list.length} fotos...`,
              { id: toastId },
            );
          }
        }
      };

      const worker = async (): Promise<void> => {
        while (cursor < list.length && !controller.signal.aborted) {
          const i = cursor++;
          await runOne(list[i]);
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
