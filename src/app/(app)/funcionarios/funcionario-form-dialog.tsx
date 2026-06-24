"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Funcionario } from "@/db/schema";
import {
  createFuncionarioAction,
  updateFuncionarioAction,
  type NovoFuncionarioState,
} from "./actions";

type Props = {
  funcionario?: Funcionario;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function FuncionarioFormDialog({
  funcionario,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const isEdit = Boolean(funcionario);

  const action = isEdit
    ? updateFuncionarioAction.bind(null, funcionario!.id)
    : createFuncionarioAction;

  const [state, formAction, pending] = useActionState<
    NovoFuncionarioState,
    FormData
  >(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.fieldErrors && !result.error) {
      setOpen(false);
    }
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled ? (
        <DialogTrigger
          render={
            trigger ?? (
              <Button>
                <Plus className="mr-1.5 size-4" />
                Novo funcionário
              </Button>
            )
          }
        />
      ) : null}
      <DialogContent className="rounded-none border-t-2 border-t-foreground">
        <DialogHeader>
          <DialogTitle className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {isEdit ? "Editar funcionário" : "Novo funcionário interno"}
          </DialogTitle>
          <DialogDescription className="-mt-1 text-[20px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            {isEdit ? "Atualizar nome" : "Cadastro do colaborador"}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="nome"
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground"
            >
              Nome
            </Label>
            <Input
              id="nome"
              name="nome"
              required
              defaultValue={funcionario?.nome ?? ""}
              placeholder="Beto Silva"
              disabled={pending}
              autoFocus
            />
            {state.fieldErrors?.nome ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.nome}
              </p>
            ) : null}
            {!isEdit ? (
              <p className="text-xs text-muted-foreground">
                Um link permanente é gerado automaticamente ao criar.
              </p>
            ) : null}
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : isEdit ? "Salvar" : "Criar e abrir"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
