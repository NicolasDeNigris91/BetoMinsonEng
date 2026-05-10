"use client";

import { useTransition } from "react";
import { CheckCheck, FileDown, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import {
  finalizeVistoriaAction,
  reopenVistoriaAction,
  deleteVistoriaFromEditPageAction,
} from "./actions";

export function VistoriaActionsBar({
  vistoriaId,
  status,
}: {
  vistoriaId: string;
  status: "rascunho" | "finalizada";
}) {
  const [pending, start] = useTransition();

  const finalize = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await finalizeVistoriaAction(vistoriaId);
          toast.success("Vistoria finalizada");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          resolve();
        }
      });
    });

  const reopen = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await reopenVistoriaAction(vistoriaId);
          toast.success("Vistoria reaberta");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          resolve();
        }
      });
    });

  const remove = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await deleteVistoriaFromEditPageAction(vistoriaId);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          resolve();
        }
      });
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        render={
          <a
            href={`/api/pdf/${vistoriaId}`}
            target="_blank"
            rel="noreferrer"
          />
        }
      >
        <FileDown className="mr-1.5 size-4" />
        Exportar PDF
      </Button>
      {status === "rascunho" ? (
        <>
          <ConfirmDialog
            title="Finalizar vistoria?"
            description="Após finalizar, ela fica em modo somente leitura. Você pode reabrir a qualquer momento."
            confirmLabel="Finalizar"
            onConfirm={finalize}
            trigger={
              <Button size="sm" disabled={pending}>
                <CheckCheck className="mr-1.5 size-4" />
                Finalizar vistoria
              </Button>
            }
          />
          <ConfirmDialog
            title="Excluir vistoria?"
            description="Todos os achados criados nesta vistoria e marcações de eventos serão removidos. Achados criados em outras vistorias não são afetados."
            confirmLabel="Excluir"
            destructive
            onConfirm={remove}
            trigger={
              <Button size="sm" variant="ghost" disabled={pending}>
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={reopen}>
          <RotateCcw className="mr-1.5 size-4" />
          Reabrir
        </Button>
      )}
    </div>
  );
}
