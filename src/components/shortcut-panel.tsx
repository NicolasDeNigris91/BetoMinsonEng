"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SEQUENCE_TIMEOUT_MS = 1500;

// Lista exibida no overlay. So mostramos o que esta realmente cabeado —
// se um atalho contextual for adicionado depois (ex.: Cmd+Enter finalizar
// vistoria), incluir aqui na hora.
const SHORTCUTS = [
  {
    group: "Global",
    items: [
      { label: "Buscar", keys: ["⌘", "K"] },
      { label: "Mostrar / esconder este painel", keys: ["?"] },
      { label: "Ir para o painel", keys: ["g", "then", "p"] },
      { label: "Ir para empreendimentos", keys: ["g", "then", "e"] },
    ],
  },
  {
    group: "Na vistoria",
    items: [{ label: "Novo achado", keys: ["n"] }],
  },
  {
    group: "Na unidade",
    items: [{ label: "Nova vistoria", keys: ["n"] }],
  },
];

/**
 * Overlay de atalhos de teclado. Acionado pela tecla "?". Tambem cuida das
 * sequencias "g p" (-> painel) e "g e" (-> empreendimentos), padrao
 * Gmail/GitHub.
 *
 * Single-key shortcuts contextuais (tipo "n" pra abrir dialog de novo
 * achado) ficam nas proprias paginas via `useShortcut` — esse componente
 * so cuida do que e global.
 */
export function ShortcutPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let gPressed = false;
    let gTimeout: number | undefined;

    const clearG = () => {
      gPressed = false;
      if (gTimeout != null) {
        window.clearTimeout(gTimeout);
        gTimeout = undefined;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;

      // Esc fecha o painel quando aberto.
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }

      // Combos Cmd/Ctrl saem desse listener — Cmd+K e' tratado pelo
      // command-palette, nao queremos interferir.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        clearG();
        return;
      }

      // ? abre/fecha o painel.
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
        clearG();
        return;
      }

      // Sequencia g + (p|e).
      if (gPressed) {
        if (e.key === "p") {
          e.preventDefault();
          clearG();
          router.push("/");
          return;
        }
        if (e.key === "e") {
          e.preventDefault();
          clearG();
          router.push("/empreendimentos");
          return;
        }
        // Qualquer outra tecla cancela a sequencia.
        clearG();
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        gPressed = true;
        gTimeout = window.setTimeout(clearG, SEQUENCE_TIMEOUT_MS);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearG();
    };
  }, [open, router]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-20 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg border border-zinc-700 border-t-2 border-t-orange-500 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-zinc-700 pb-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-zinc-400">
              DIMINSON · ENG · ATALHOS
            </div>
            <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-zinc-100">
              Atalhos de teclado
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="border border-zinc-600 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:text-zinc-100"
            aria-label="Fechar"
          >
            esc
          </button>
        </div>

        {SHORTCUTS.map((g) => (
          <div key={g.group} className="mb-3 last:mb-0">
            <h3 className="mb-1 font-mono text-[10px] tracking-[0.14em] uppercase text-zinc-500">
              {g.group}
            </h3>
            {g.items.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-dashed border-zinc-800 py-1.5 text-[13px] last:border-b-0"
              >
                <span className="text-zinc-200">{s.label}</span>
                <span className="flex items-center gap-1">
                  {s.keys.map((k, j) =>
                    k === "then" ? (
                      <span
                        key={j}
                        className="font-mono text-[9.5px] tracking-[0.06em] uppercase text-zinc-500"
                      >
                        then
                      </span>
                    ) : (
                      <kbd
                        key={j}
                        className="inline-block min-w-[22px] border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-center font-mono text-[11px] text-zinc-100"
                      >
                        {k}
                      </kbd>
                    ),
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
