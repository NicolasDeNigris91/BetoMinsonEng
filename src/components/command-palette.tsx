"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Building2, ClipboardList, Home, Search } from "lucide-react";
import {
  searchGlobalAction,
  type SearchResult,
} from "@/app/(app)/search-actions";
import { CATEGORIA_LABELS } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 200;

/**
 * Paleta de busca global. Atalho Cmd+K / Ctrl+K abre dialog com input;
 * digita, debounce, server action busca em empreendimentos/unidades/achados;
 * setas navegam, Enter abre.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Resultados armazenados junto da query que os gerou — assim podemos
  // descartar resultados "obsoletos" derivando em vez de chamar setState
  // (evita cascading renders em useEffect).
  const [stored, setStored] = useState<{ q: string; rows: SearchResult[] }>({
    q: "",
    rows: [],
  });
  const [highlight, setHighlight] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const results = q.length >= 2 && stored.q === q ? stored.rows : [];

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setStored({ q: "", rows: [] });
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  // Atalho global Cmd+K / Ctrl+K. Tambem ouve um custom event pra que o
  // botao no header (SearchTrigger) consiga abrir o dialog sem precisar de
  // context — mantém a paleta totalmente desacoplada do resto da UI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };
    const onCustom = () => handleOpenChange(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, [open]);

  // Debounce na busca. Quando q < 2, o effect simplesmente nao faz nada;
  // o derived `results` ja cuida de mostrar vazio.
  useEffect(() => {
    if (!open) return;
    if (q.length < 2) return;
    if (stored.q === q) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await searchGlobalAction(q);
        setStored({ q, rows: r });
        setHighlight(0);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, open, stored.q]);

  const navigate = (r: SearchResult) => {
    setOpen(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlight];
      if (r) navigate(r);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed top-[15%] left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 gap-0 overflow-hidden rounded-xl border bg-popover text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <DialogPrimitive.Title className="sr-only">
            Busca rápida
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Buscar empreendimentos, unidades e achados.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar empreendimento, unidade, achado..."
              className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>
          <div className="max-h-[60vh] min-h-[12rem] overflow-y-auto p-2">
            <Results
              query={query}
              results={results}
              highlight={highlight}
              onSelect={navigate}
              pending={isPending}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Results({
  query,
  results,
  highlight,
  onSelect,
  pending,
}: {
  query: string;
  results: SearchResult[];
  highlight: number;
  onSelect: (r: SearchResult) => void;
  pending: boolean;
}) {
  const q = query.trim();
  if (q.length < 2) {
    return (
      <p className="px-2 py-8 text-center text-xs text-muted-foreground">
        Digite ao menos 2 caracteres para buscar.
      </p>
    );
  }
  if (pending && results.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-xs text-muted-foreground">
        Buscando...
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-xs text-muted-foreground">
        Nenhum resultado para “{q}”.
      </p>
    );
  }

  // Agrupa visualmente por tipo, mantendo o indice global pra navegacao.
  const groups: { titulo: string; items: { idx: number; r: SearchResult }[] }[] = [
    { titulo: "Empreendimentos", items: [] },
    { titulo: "Unidades", items: [] },
    { titulo: "Achados", items: [] },
  ];
  results.forEach((r, idx) => {
    if (r.tipo === "empreendimento") groups[0].items.push({ idx, r });
    else if (r.tipo === "unidade") groups[1].items.push({ idx, r });
    else groups[2].items.push({ idx, r });
  });

  return (
    <div className="space-y-2">
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <div key={g.titulo}>
            <p className="px-2 pt-1 pb-0.5 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              {g.titulo}
            </p>
            <ul className="space-y-px">
              {g.items.map(({ idx, r }) => (
                <ResultRow
                  key={`${r.tipo}-${r.id}`}
                  result={r}
                  active={idx === highlight}
                  onClick={() => onSelect(r)}
                />
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function ResultRow({
  result,
  active,
  onClick,
}: {
  result: SearchResult;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={(e) => e.currentTarget.focus()}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none",
          active && "bg-accent",
        )}
      >
        <Icon result={result} />
        <span className="min-w-0 flex-1">
          {result.tipo === "empreendimento" ? (
            <>
              <span className="block truncate font-medium">{result.nome}</span>
              {result.cliente ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {result.cliente}
                </span>
              ) : null}
            </>
          ) : result.tipo === "unidade" ? (
            <>
              <span className="block truncate font-medium">{result.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {result.empreendimentoNome}
              </span>
            </>
          ) : (
            <>
              <span className="block truncate text-sm">
                {result.local ? (
                  <span className="font-medium">{result.local} · </span>
                ) : null}
                <span className="text-foreground/80">{result.descricao}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {result.empreendimentoNome} · {result.unidadeNome} ·{" "}
                {CATEGORIA_LABELS[result.categoria]}
                {result.status === "resolvido" ? " · resolvido" : ""}
              </span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}

function Icon({ result }: { result: SearchResult }) {
  if (result.tipo === "empreendimento") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
        <Building2 className="size-4" aria-hidden />
      </span>
    );
  }
  if (result.tipo === "unidade") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
        <Home className="size-4" aria-hidden />
      </span>
    );
  }
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md border bg-card">
      <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 right-0.5 size-1.5 rounded-full ring-1 ring-card",
          CATEGORIA_DOT[result.categoria],
        )}
      />
    </span>
  );
}
