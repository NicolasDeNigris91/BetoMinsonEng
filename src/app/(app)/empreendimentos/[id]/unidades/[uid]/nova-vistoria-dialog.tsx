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
import { todayISO } from "@/lib/format";
import { createVistoriaAction, type NovaVistoriaState } from "./actions";

export function NovaVistoriaDialog({
  trigger,
  unidadeId,
  defaultVistoriadorNome,
}: {
  trigger: React.ReactElement;
  unidadeId: string;
  defaultVistoriadorNome?: string;
}) {
  const [open, setOpen] = useState(false);
  const action = createVistoriaAction.bind(null, unidadeId);
  const [state, formAction, pending] = useActionState<NovaVistoriaState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (!result.fieldErrors && !result.error) setOpen(false);
      return result;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova vistoria</DialogTitle>
          <DialogDescription>
            Os achados ainda abertos da unidade aparecerão como checklist.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="data">Data</Label>
            <Input
              id="data"
              name="data"
              type="date"
              defaultValue={todayISO()}
              required
              disabled={pending}
            />
            {state.fieldErrors?.data ? (
              <p className="text-sm text-destructive">{state.fieldErrors.data}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vistoriadorNome">Vistoriador</Label>
            <Input
              id="vistoriadorNome"
              name="vistoriadorNome"
              defaultValue={defaultVistoriadorNome ?? "Roberto Minson"}
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
              {pending ? "Criando..." : "Criar vistoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
