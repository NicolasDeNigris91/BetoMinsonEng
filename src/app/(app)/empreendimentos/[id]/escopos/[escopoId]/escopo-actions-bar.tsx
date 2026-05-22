"use client";

import { useState, useTransition } from "react";
import { FileDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { isNextRedirectError } from "@/lib/next-errors";
import type { Escopo } from "@/db/schema";
import { EscopoFormDialog } from "../novo-escopo-dialog";
import { deleteEscopoAction } from "../actions";

type Props = {
  escopo: Escopo;
  nAchados: number;
};

export function EscopoActionsBar({ escopo, nAchados }: Props) {
  const [pending, start] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const remove = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          const result = await deleteEscopoAction(escopo.id);
          if (result?.error) toast.error(result.error);
        } catch (err) {
          if (isNextRedirectError(err)) {
            resolve();
            throw err;
          }
          toast.error("Erro ao excluir. Tente novamente.");
        } finally {
          resolve();
        }
      });
    });

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          size="sm"
          disabled={nAchados === 0 || pending}
          title={
            nAchados === 0
              ? "Adicione achados ao escopo antes de gerar o PDF"
              : undefined
          }
          render={
            nAchados === 0 ? (
              <button type="button" />
            ) : (
              <a
                href={`/api/pdf/escopo/${escopo.id}`}
                target="_blank"
                rel="noreferrer"
              />
            )
          }
        >
          <FileDown className="mr-1.5 size-4" />
          Gerar PDF
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:opacity-50"
            aria-label="Mais ações"
            disabled={pending}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 size-4" />
              Renomear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive data-highlighted:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EscopoFormDialog
        empreendimentoId={escopo.empreendimentoId}
        escopo={escopo}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        title="Excluir escopo?"
        description="Os achados em si não são excluídos — só a referência neste escopo. Os achados continuam disponíveis nas vistorias."
        confirmLabel="Excluir"
        destructive
        onConfirm={remove}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
