"use client";

import { useTransition } from "react";
import type { DateFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setDateFormatAction } from "./date-format-actions";

/**
 * Segmento BR / ISO no header. Troca o cookie via server action,
 * `revalidatePath("/", "layout")` cuida do re-render com o novo formato.
 */
export function DateFormatToggle({ current }: { current: DateFormat }) {
  const [pending, start] = useTransition();

  const swap = (next: DateFormat) => {
    if (next === current) return;
    start(async () => {
      await setDateFormatAction(next);
    });
  };

  return (
    <div
      className="inline-flex border border-border font-mono text-[9.5px] tracking-[0.1em] uppercase"
      role="group"
      aria-label="Formato de data"
    >
      <button
        type="button"
        onClick={() => swap("br")}
        disabled={pending}
        aria-pressed={current === "br"}
        title="Datas em formato brasileiro: dd/MM/yyyy"
        className={cn(
          "px-2 py-0.5 transition-colors disabled:opacity-50",
          current === "br"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        BR
      </button>
      <button
        type="button"
        onClick={() => swap("iso")}
        disabled={pending}
        aria-pressed={current === "iso"}
        title="Datas em formato ISO: yyyy-MM-dd"
        className={cn(
          "px-2 py-0.5 transition-colors disabled:opacity-50",
          current === "iso"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        ISO
      </button>
    </div>
  );
}
