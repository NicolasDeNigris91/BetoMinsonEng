"use client";

import { useSyncExternalStore } from "react";
import { Search } from "lucide-react";

const noopSubscribe = () => () => {};
const detectMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Botao discreto no header que abre a paleta global de busca. A paleta
 * em si esta montada no layout e ouve um custom event 'open-command-palette',
 * entao aqui so disparamos esse evento. Tambem mostra o atalho relevante
 * pro SO do usuario.
 */
export function SearchTrigger() {
  // useSyncExternalStore com snapshot do servidor = false evita o pattern
  // "setState dentro de useEffect" pra detectar plataforma sem quebrar SSR.
  const isMac = useSyncExternalStore(noopSubscribe, detectMac, () => false);

  const handleClick = () => {
    window.dispatchEvent(new Event("open-command-palette"));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Abrir busca rápida"
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Search className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Buscar</span>
      <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">
        {isMac ? "⌘K" : "Ctrl+K"}
      </kbd>
    </button>
  );
}
