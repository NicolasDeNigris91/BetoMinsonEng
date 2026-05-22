"use client";

import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoriaEnum, type Categoria } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createAchadoAction, type NovoAchadoState } from "./actions";

type Props = {
  vistoriaId: string;
};

export function NovoAchadoInline({ vistoriaId }: Props) {
  // Matéria fica "grudada" entre criações — fluxo típico cria vários da
  // mesma matéria em sequência (toda a sala de ELE, depois HID...). Local e
  // descrição limpam após sucesso, foco volta pra descrição.
  const [categoria, setCategoria] = useState<Categoria>("ELE");
  const [local, setLocal] = useState("");
  const [descricao, setDescricao] = useState("");
  const descRef = useRef<HTMLInputElement>(null);

  const action = createAchadoAction.bind(null, vistoriaId);
  const [state, formAction, pending] = useActionState<NovoAchadoState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (!result.fieldErrors && !result.error) {
        setLocal("");
        setDescricao("");
        queueMicrotask(() => descRef.current?.focus());
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    },
    {},
  );

  // Mostra QUALQUER fieldError — pega tambem casos como prazoEm que esse
  // form nao expoe mas o schema valida. Sem isso, erro de validacao silencia
  // e o usuario ve "nada acontece".
  const fieldError = Object.values(state.fieldErrors ?? {})[0];

  return (
    <form
      action={formAction}
      className="rounded-lg border-2 border-dashed border-primary/30 bg-card p-3 shadow-sm"
    >
      <p className="mb-2 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
        Novo achado rápido — Enter pra salvar e seguir
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Select
          name="categoria"
          value={categoria}
          onValueChange={(v) => setCategoria(v as Categoria)}
          disabled={pending}
        >
          <SelectTrigger className="w-full sm:w-24" aria-label="Matéria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoriaEnum.enumValues.map((c) => (
              <SelectItem key={c} value={c}>
                <span
                  aria-hidden
                  className={cn(
                    "mr-1 inline-block size-2.5 rounded-full",
                    CATEGORIA_DOT[c],
                  )}
                />
                <span className="font-mono">{c}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          name="local"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Local (opcional)"
          disabled={pending}
          aria-label="Local"
          className="w-full sm:w-44"
        />
        <Input
          ref={descRef}
          name="descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="O que foi encontrado..."
          disabled={pending}
          required
          aria-label="Descrição"
          className="flex-1"
        />
        {/* Schema da action exige prazoEm presente (""="sem prazo"). O form
            inline nao expoe prazo — pra setar prazo o usuario abre o card. */}
        <input type="hidden" name="prazoEm" value="" />
        <Button type="submit" disabled={pending || !descricao.trim()}>
          <Plus className="mr-1.5 size-4" />
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
      {fieldError ? (
        <p className="mt-2 text-sm text-destructive">{fieldError}</p>
      ) : null}
    </form>
  );
}
