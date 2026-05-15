import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Pagina atual (1-indexed). */
  page: number;
  /** Total de paginas (>= 1). */
  totalPages: number;
  /** Construtor de href dado o numero da pagina. Permite o componente nao
   *  conhecer searchParams ou pathname. */
  hrefForPage: (page: number) => string;
};

/**
 * Paginacao server-only. Renderiza ate 7 botoes: primeira, anterior,
 * janela com 3 paginas em torno da atual, proxima, ultima. Esconde
 * proximas/anteriores nas pontas. Nada renderizado quando totalPages <= 1.
 */
export function Pagination({ page, totalPages, hrefForPage }: Props) {
  if (totalPages <= 1) return null;

  const windowPages = pageWindow(page, totalPages);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <nav
      role="navigation"
      aria-label="Paginacao"
      className="flex items-center justify-center gap-1 pt-2"
    >
      <PageLink
        href={hrefForPage(page - 1)}
        disabled={!canPrev}
        ariaLabel="Pagina anterior"
      >
        <ChevronLeft className="size-4" />
      </PageLink>

      {windowPages.map((p, i) =>
        p === "ellipsis" ? (
          <span
            key={`e-${i}`}
            className="px-1 font-mono text-[11px] text-muted-foreground"
          >
            …
          </span>
        ) : (
          <PageLink
            key={p}
            href={hrefForPage(p)}
            active={p === page}
            ariaLabel={`Pagina ${p}`}
          >
            <span className="tabular-nums">{p}</span>
          </PageLink>
        ),
      )}

      <PageLink
        href={hrefForPage(page + 1)}
        disabled={!canNext}
        ariaLabel="Proxima pagina"
      >
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  active,
  disabled,
  ariaLabel,
  children,
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-mono text-[11px] tabular-nums transition-colors";

  if (disabled) {
    return (
      <span
        aria-disabled
        aria-label={ariaLabel}
        className={cn(base, "border-border bg-card text-muted-foreground/40")}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

type Slot = number | "ellipsis";

/**
 * Janela compacta: primeira, ..., [page-1, page, page+1], ..., ultima.
 * Sem duplicatas, sem ellipsis com gap de 1.
 */
function pageWindow(page: number, total: number): Slot[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const slots: Slot[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) slots.push("ellipsis");
  for (let i = start; i <= end; i++) slots.push(i);
  if (end < total - 1) slots.push("ellipsis");
  slots.push(total);
  return slots;
}
