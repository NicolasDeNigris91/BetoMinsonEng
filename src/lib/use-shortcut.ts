"use client";

import { useEffect, useRef } from "react";

type Options = {
  /** Quando false, o atalho fica inativo (ex.: enquanto pending). */
  enabled?: boolean;
  /** Exige Cmd/Ctrl pressionado junto. Pra combos tipo Cmd+Enter. */
  meta?: boolean;
};

/**
 * Registra um atalho global de teclado. So dispara quando o foco nao esta
 * em INPUT/TEXTAREA/SELECT/contenteditable — evita comer letras digitadas
 * em forms.
 *
 * O handler vai pra ref pra que mudancas de closure (callbacks com
 * dependencias) nao force re-attach do listener.
 */
export function useShortcut(
  key: string,
  handler: () => void,
  opts: Options = {},
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (opts.enabled === false) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;

      if (opts.meta) {
        if (!(e.metaKey || e.ctrlKey)) return;
      } else {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
      }
      if (e.key !== key) return;
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, opts.enabled, opts.meta]);
}
