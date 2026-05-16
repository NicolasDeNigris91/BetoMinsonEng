"use client";

import { useRouter } from "next/navigation";
import { useShortcut } from "@/lib/use-shortcut";

/**
 * Atalhos contextuais da pagina da unidade. Renderiza nada — so registra
 * listeners. O dialog de "nova vistoria" tem seu proprio atalho ("n") via
 * NovaVistoriaDialog; aqui cobrimos "h" pra ir ao historico.
 */
export function UnidadeShortcuts({ historicoHref }: { historicoHref: string }) {
  const router = useRouter();
  useShortcut("h", () => router.push(historicoHref));
  return null;
}
