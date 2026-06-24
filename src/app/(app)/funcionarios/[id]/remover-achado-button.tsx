"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { isNextRedirectError } from "@/lib/next-errors";
import { removerAchadoAction } from "../actions";

type Props = {
  funcionarioId: string;
  achadoId: string;
  label?: string;
};

export function RemoverAchadoButton({
  funcionarioId,
  achadoId,
  label,
}: Props) {
  const [pending, start] = useTransition();

  const onConfirm = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await removerAchadoAction(funcionarioId, achadoId);
          toast.success("Achado removido");
        } catch (err) {
          if (isNextRedirectError(err)) {
            resolve();
            throw err;
          }
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          resolve();
        }
      });
    });

  return (
    <ConfirmDialog
      title="Remover achado do funcionário?"
      description={
        label
          ? `Remover "${label}" da lista do funcionário. O achado em si não é apagado.`
          : "Remover o achado da lista do funcionário. O achado em si não é apagado."
      }
      destructive
      confirmLabel="Remover"
      onConfirm={onConfirm}
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Remover achado"
          disabled={pending}
        >
          <X className="size-3.5" />
        </Button>
      }
    />
  );
}
