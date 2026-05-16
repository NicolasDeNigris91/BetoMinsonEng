"use client";

import { useActionState, useRef, useEffect } from "react";
import { Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createUnidadeAction, type UnidadeFormState } from "./actions";

type Props = {
  empreendimentoId: string;
};

/**
 * Empty state compacto com input inline pra criar a primeira unidade —
 * Enter no proprio campo cria sem precisar abrir modal. O server action
 * faz redirect pra unidade nova, entao basta submitar e o Next leva.
 */
export function UnidadeQuickAdd({ empreendimentoId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const action = createUnidadeAction.bind(null, empreendimentoId);
  const [state, formAction, pending] = useActionState<UnidadeFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      return result ?? {};
    },
    {},
  );

  // Foca de novo no input apos erro pra o usuario corrigir e re-submitar.
  useEffect(() => {
    if (state.fieldErrors || state.error) {
      inputRef.current?.focus();
    }
  }, [state]);

  return (
    <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center">
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
          <Home className="size-8 text-muted-foreground/60" aria-hidden />
        </div>
        <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          Sem unidades cadastradas
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre a primeira unidade pra começar a registrar vistorias.
        </p>
        <form action={formAction} className="mt-5 flex w-full max-w-xs gap-2">
          <input
            ref={inputRef}
            name="nome"
            required
            disabled={pending}
            placeholder="Ex: Casa 01, Apto 102…"
            autoFocus
            className="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button size="sm" type="submit" disabled={pending}>
            <Plus className="mr-1 size-3.5" />
            {pending ? "Salvando..." : "Adicionar"}
          </Button>
        </form>
        {state.fieldErrors?.nome ? (
          <p className="mt-2 text-xs text-destructive">{state.fieldErrors.nome}</p>
        ) : state.error ? (
          <p className="mt-2 text-xs text-destructive">{state.error}</p>
        ) : (
          <p className="mt-2 font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground/70">
            Enter pra confirmar
          </p>
        )}
      </div>
    </div>
  );
}
