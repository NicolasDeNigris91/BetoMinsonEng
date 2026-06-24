"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Categoria } from "@/db/schema";

export type AchadoChipRef = {
  id: string;
  local: string | null;
  descricao: string;
  categoria: Categoria;
};

type EngenhariaContextValue = {
  open: boolean;
  achadoRef: AchadoChipRef | null;
  openSheetWith: (ref: AchadoChipRef | null) => void;
  closeSheet: () => void;
  clearAchadoRef: () => void;
};

const EngenhariaContext = createContext<EngenhariaContextValue | null>(null);

export function EngenhariaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [achadoRef, setAchadoRef] = useState<AchadoChipRef | null>(null);

  const openSheetWith = useCallback((ref: AchadoChipRef | null) => {
    setAchadoRef(ref);
    setOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setOpen(false);
    setAchadoRef(null);
  }, []);

  const clearAchadoRef = useCallback(() => {
    setAchadoRef(null);
  }, []);

  const value = useMemo<EngenhariaContextValue>(
    () => ({ open, achadoRef, openSheetWith, closeSheet, clearAchadoRef }),
    [open, achadoRef, openSheetWith, closeSheet, clearAchadoRef],
  );

  return (
    <EngenhariaContext.Provider value={value}>
      {children}
    </EngenhariaContext.Provider>
  );
}

export function useEngenharia(): EngenhariaContextValue {
  const ctx = useContext(EngenhariaContext);
  if (!ctx) {
    throw new Error(
      "useEngenharia precisa ser chamado dentro de <EngenhariaProvider>",
    );
  }
  return ctx;
}
