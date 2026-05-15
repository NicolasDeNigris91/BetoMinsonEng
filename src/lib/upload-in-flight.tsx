"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Tracker compartilhado de uploads em voo dentro de uma página.
// Uso: envolver a hierarquia (page de vistoria) com UploadInFlightProvider;
// usePhotoUpload chama begin/end automaticamente quando há provider; outros
// componentes (ex: VistoriaActionsBar) leem `count > 0` pra desabilitar
// "Finalizar" enquanto há foto sendo processada.
//
// Sem provider, o hook do uploader continua funcionando — o tracker é
// opcional (null), zero impacto em telas que não precisam orquestrar.

type Tracker = {
  count: number;
  begin: () => void;
  end: () => void;
};

const Ctx = createContext<Tracker | null>(null);

export function UploadInFlightProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const value = useMemo(
    () => ({ count, begin, end }),
    [count, begin, end],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploadInFlight(): Tracker | null {
  return useContext(Ctx);
}
