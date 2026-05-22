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
import { Textarea } from "@/components/ui/textarea";
import type { Escopo } from "@/db/schema";
import {
  createEscopoAction,
  updateEscopoAction,
  type NovoEscopoState,
} from "./actions";

type Props = {
  empreendimentoId: string;
  escopo?: Escopo;
  trigger?: React.ReactElement;
  /** Controle externo do open. Quando passado, o componente vira controlado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function EscopoFormDialog({
  empreendimentoId,
  escopo,
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
  const isEdit = Boolean(escopo);

  const action = isEdit
    ? updateEscopoAction.bind(null, escopo!.id)
    : createEscopoAction.bind(null, empreendimentoId);

  const [state, formAction, pending] = useActionState<
    NovoEscopoState,
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
                Novo escopo
              </Button>
            )
          }
        />
      ) : null}
      <DialogContent className="rounded-none border-t-2 border-t-foreground">
        <DialogHeader>
          <DialogTitle className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {isEdit ? "Editar escopo" : "Novo escopo"}
          </DialogTitle>
          <DialogDescription className="-mt-1 text-[20px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            {isEdit ? "Atualizar nome e descrição" : "Ordem de serviço por profissional"}
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
              defaultValue={escopo?.nome ?? ""}
              placeholder="João — Elétrica 28/05"
              disabled={pending}
              autoFocus
            />
            {state.fieldErrors?.nome ? (
              <p className="text-sm text-destructive">{state.fieldErrors.nome}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="descricao"
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground"
            >
              Descrição (opcional)
            </Label>
            <Textarea
              id="descricao"
              name="descricao"
              rows={3}
              defaultValue={escopo?.descricao ?? ""}
              placeholder="Anotação livre — prazo, contato do profissional, etc."
              disabled={pending}
            />
            {state.fieldErrors?.descricao ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.descricao}
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

