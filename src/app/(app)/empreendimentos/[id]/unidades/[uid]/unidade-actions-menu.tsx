"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UnidadeFormDialog } from "../../unidade-form";
import { deleteUnidadeAction } from "../../actions";
import type { Unidade } from "@/db/schema";

type Props = {
  empreendimentoId: string;
  unidade: Unidade;
};

/**
 * Acoes secundarias da unidade (Editar/Excluir) num menu "...", separadas
 * do botao primario "Historico". Mesmo pattern do HeaderActionsMenu do
 * empreendimento.
 */
export function UnidadeActionsMenu({ empreendimentoId, unidade }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
          aria-label="Mais ações"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 size-4" />
            Editar
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

      <UnidadeFormDialog
        empreendimentoId={empreendimentoId}
        unidade={unidade}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        title="Excluir unidade?"
        description="Todas as vistorias, achados e fotos desta unidade serão removidos."
        confirmLabel="Excluir"
        destructive
        onConfirm={deleteUnidadeAction.bind(null, unidade.id)}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
