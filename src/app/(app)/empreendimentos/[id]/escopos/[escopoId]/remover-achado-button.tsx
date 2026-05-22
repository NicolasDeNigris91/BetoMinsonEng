"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isNextRedirectError } from "@/lib/next-errors";
import { removeAchadoFromEscopoAction } from "../actions";

type Props = {
  escopoId: string;
  achadoId: string;
};

export function RemoverAchadoButton({ escopoId, achadoId }: Props) {
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Remover do escopo"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            const result = await removeAchadoFromEscopoAction(
              escopoId,
              achadoId,
            );
            if (result?.error) toast.error(result.error);
          } catch (err) {
            if (isNextRedirectError(err)) throw err;
            toast.error("Erro ao remover. Tente novamente.");
          }
        });
      }}
    >
      <X className="size-4" />
    </Button>
  );
}
