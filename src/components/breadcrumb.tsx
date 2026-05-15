import Link from "next/link";

type Item = {
  label: string;
  href?: string;
};

/**
 * Breadcrumb em mono caps com tracking aberto, separador "/" sutil.
 * Item sem href vira o atual (texto foreground, nao linkavel).
 */
export function Breadcrumb({ items }: { items: Item[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-x-2">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground">{item.label}</span>
            )}
            {!isLast ? (
              <span aria-hidden className="text-muted-foreground/40">
                /
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
