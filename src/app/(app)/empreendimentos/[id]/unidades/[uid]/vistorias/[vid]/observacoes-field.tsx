"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { updateObservacoesAction } from "./actions";

export function ObservacoesField({
  vistoriaId,
  initial,
  editable,
}: {
  vistoriaId: string;
  initial: string;
  editable: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = value !== savedValue;

  if (!editable) {
    if (!initial) return null;
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium mb-1">Observações gerais</p>
        <p className="text-sm whitespace-pre-line">{initial}</p>
      </div>
    );
  }

  const save = () => {
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("observacoesGerais", value);
        await updateObservacoesAction(vistoriaId, fd);
        setSavedValue(value);
        toast.success("Observações salvas");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="observacoesGerais">Observações gerais</Label>
        {dirty ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={save}
          >
            <Save className="mr-1 size-4" />
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        ) : null}
      </div>
      <Textarea
        id="observacoesGerais"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Notas gerais sobre esta vistoria..."
        disabled={pending}
      />
    </div>
  );
}
