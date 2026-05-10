"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIA_LABELS,
  categoriaEnum,
  type Achado,
} from "@/db/schema";
import {
  createAchadoAction,
  updateAchadoAction,
  type NovoAchadoState,
} from "./actions";

type Props = {
  vistoriaId: string;
  achado?: Achado;
  trigger?: React.ReactElement;
};

export function AchadoFormDialog({ vistoriaId, achado, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(achado);

  const action = isEdit
    ? updateAchadoAction.bind(null, achado!.id, vistoriaId)
    : createAchadoAction.bind(null, vistoriaId);

  const [state, formAction, pending] = useActionState<NovoAchadoState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (!result.fieldErrors && !result.error) {
        setOpen(false);
      }
      return result;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <Plus className="mr-1.5 size-4" />
              Novo achado
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar achado" : "Novo achado nesta vistoria"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ajustes em descrição, local e matéria."
              : "Categoria, local e descrição do que foi encontrado."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categoria">Matéria*</Label>
            <Select
              name="categoria"
              defaultValue={achado?.categoria ?? "ELE"}
              disabled={pending}
            >
              <SelectTrigger id="categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoriaEnum.enumValues.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORIA_LABELS[c]} ({c})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.categoria ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.categoria}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="local">Local</Label>
            <Input
              id="local"
              name="local"
              defaultValue={achado?.local ?? ""}
              placeholder="Ex: Térreo - sala de estar"
              disabled={pending}
            />
            {state.fieldErrors?.local ? (
              <p className="text-sm text-destructive">{state.fieldErrors.local}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição*</Label>
            <Textarea
              id="descricao"
              name="descricao"
              required
              defaultValue={achado?.descricao ?? ""}
              rows={5}
              placeholder="O que foi encontrado, o que precisa ser feito..."
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
              {pending ? "Salvando..." : isEdit ? "Salvar" : "Criar achado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
