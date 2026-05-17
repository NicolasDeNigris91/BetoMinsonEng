"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ClipboardPlus, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isNextRedirectError } from "@/lib/next-errors";
import { quickCreateVistoriaAction } from "./quick-actions";

export type CardUnidade = {
  id: string;
  nome: string;
};

type Props = {
  empreendimentoId: string;
  nUnidades: number;
  unidades: CardUnidade[];
};

/**
 * Barra de acoes no rodape do card de empreendimento:
 *   - "+ Vistoria": dropdown com unidades. Click cria vistoria em rascunho
 *     pra hoje e redireciona. Com 1 unidade so, vai direto sem dropdown.
 *     Quando nao ha unidades cadastradas, fica disabled.
 *   - "PDF": link pro relatorio consolidado em nova aba.
 *
 * Esses botoes NAO ficam dentro do <Link> que cobre o resto do card —
 * sao siblings, evitando aninhar interativos.
 */
export function EmpreendimentoCardActions({
  empreendimentoId,
  nUnidades,
  unidades,
}: Props) {
  const [pending, start] = useTransition();
  const noUnidades = nUnidades === 0;
  const singleUnidade = unidades.length === 1 ? unidades[0] : null;

  const handleQuickCreate = (unidadeId: string) => {
    start(async () => {
      try {
        await quickCreateVistoriaAction(unidadeId);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Erro ao criar vistoria");
      }
    });
  };

  const primaryBtnClass = cn(
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-[0.04em] uppercase text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50",
  );

  return (
    <div className="flex items-center gap-1.5 border-t border-border/70 bg-muted/20 px-4 py-2">
      {singleUnidade ? (
        <button
          type="button"
          onClick={() => handleQuickCreate(singleUnidade.id)}
          disabled={pending}
          className={primaryBtnClass}
          aria-label={`Nova vistoria em ${singleUnidade.nome}`}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ClipboardPlus className="size-3.5" />
          )}
          Vistoria
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={noUnidades || pending}
            className={primaryBtnClass}
            aria-label="Iniciar nova vistoria"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ClipboardPlus className="size-3.5" />
            )}
            Vistoria
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {/* Label + items DENTRO de Group: Base UI Menu exige que
                GroupLabel viva sob Group; sem isso crasha em prod com
                Base UI error #31 (em dev so emite warning). */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Em qual unidade?</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {unidades.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Nenhuma unidade cadastrada ainda.
                </p>
              ) : (
                unidades.map((u) => (
                  <DropdownMenuItem
                    key={u.id}
                    onClick={() => handleQuickCreate(u.id)}
                  >
                    {u.nome}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Link
        href={`/api/pdf/consolidado/${empreendimentoId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="Baixar relatório consolidado"
        title="Relatório consolidado"
      >
        <FileText className="size-3.5" />
        PDF
      </Link>
    </div>
  );
}
