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
  createEmpreendimentoAction,
  updateEmpreendimentoAction,
  type EmpreendimentoFormState,
} from "./actions";
import type { Empreendimento } from "@/db/schema";

type Props = {
  trigger: React.ReactElement;
  empreendimento?: Empreendimento;
};

export function EmpreendimentoFormDialog({ trigger, empreendimento }: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(empreendimento);

  const action = isEdit
    ? updateEmpreendimentoAction.bind(null, empreendimento!.id)
    : createEmpreendimentoAction;

  const [state, formAction, pending] = useActionState<
    EmpreendimentoFormState,
    FormData
  >(async (prev, formData) => {
    const result = await action(prev, formData);
    // result pode ser undefined quando o action faz redirect (ex: criar).
    if (!result?.fieldErrors && !result?.error) setOpen(false);
    return result ?? {};
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar empreendimento" : "Novo empreendimento"}
          </DialogTitle>
          <DialogDescription>
            Cadastre informações que aparecerão no cabeçalho dos relatórios.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome*</Label>
            <Input
              id="nome"
              name="nome"
              required
              defaultValue={empreendimento?.nome ?? ""}
              placeholder="Ex: Villa Chamonix"
              disabled={pending}
            />
            {state.fieldErrors?.nome ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.nome}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cliente">Cliente</Label>
            <Input
              id="cliente"
              name="cliente"
              defaultValue={empreendimento?.cliente ?? ""}
              placeholder="Construtora / proprietário"
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Input
              id="endereco"
              name="endereco"
              defaultValue={empreendimento?.endereco ?? ""}
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              defaultValue={empreendimento?.observacoes ?? ""}
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
                  : "Criar empreendimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
