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
import type { Funcionario } from "@/db/schema";
import { FuncionarioFormDialog } from "../funcionario-form-dialog";
import { deleteFuncionarioAction } from "../actions";

type Props = {
  funcionario: Funcionario;
};

export function HeaderActionsMenu({ funcionario }: Props) {
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

      <FuncionarioFormDialog
        funcionario={funcionario}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        title="Excluir funcionário?"
        description="As atribuições de achados são removidas. O histórico de marcações já feitas pelo funcionário fica preservado nas vistorias (sem identificar mais o autor). Para apenas tirar o acesso, prefira desativar."
        confirmLabel="Excluir"
        destructive
        onConfirm={deleteFuncionarioAction.bind(null, funcionario.id)}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
