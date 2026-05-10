"use client";

import { useActionState, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createUnidadeAction,
  updateUnidadeAction,
  type UnidadeFormState,
} from "./actions";
import type { Unidade } from "@/db/schema";

type Props = {
  trigger: React.ReactElement;
  empreendimentoId: string;
  unidade?: Unidade;
};

export function UnidadeFormDialog({
  trigger,
  empreendimentoId,
  unidade,
}: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(unidade);

  const action = isEdit
    ? updateUnidadeAction.bind(null, unidade!.id)
    : createUnidadeAction.bind(null, empreendimentoId);

  const [state, formAction, pending] = useActionState<
    UnidadeFormState,
    FormData
  >(action, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar unidade" : "Nova unidade"}
          </DialogTitle>
          <DialogDescription>
            Cada casa, lote ou apartamento dentro do empreendimento.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome*</Label>
            <Input
              id="nome"
              name="nome"
              required
              defaultValue={unidade?.nome ?? ""}
              placeholder="Ex: Casa 1"
              disabled={pending}
            />
            {state.fieldErrors?.nome ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.nome}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              defaultValue={unidade?.observacoes ?? ""}
              rows={3}
              disabled={pending}
            />
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Salvando..."
                : isEdit
                  ? "Salvar alterações"
                  : "Criar unidade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
