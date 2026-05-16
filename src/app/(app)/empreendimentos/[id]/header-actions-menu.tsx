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
import { EmpreendimentoFormDialog } from "../empreendimento-form";
import { deleteEmpreendimentoAction } from "../actions";
import type { Empreendimento } from "@/db/schema";

type Props = {
  empreendimento: Empreendimento;
};

/**
 * Acoes secundarias do empreendimento (Editar/Excluir) num menu "...",
 * separadas dos botoes primarios (Consolidado/Evolucao). Evita o lixeira
 * solta colada num botao, que era um anti-pattern de risco de misclick.
 */
export function HeaderActionsMenu({ empreendimento }: Props) {
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

      <EmpreendimentoFormDialog
        empreendimento={empreendimento}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        title="Excluir empreendimento?"
        description="Todos os dados (unidades, vistorias, achados, fotos) serão removidos permanentemente."
        confirmLabel="Excluir tudo"
        destructive
        onConfirm={deleteEmpreendimentoAction.bind(null, empreendimento.id)}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
