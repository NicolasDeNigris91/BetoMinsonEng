"use client";

import { useState, useTransition } from "react";
import {
  CheckCheck,
  FileDown,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUploadInFlight } from "@/lib/upload-in-flight";
import { isNextRedirectError } from "@/lib/next-errors";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Bloqueia Finalizar/Excluir enquanto há upload em voo — caso contrário,
  // a vistoria fecha (status=finalizada) e a foto que ainda está sendo
  // processada pelo Sharp acaba rejeitada com 409 ou salva órfã.
  const tracker = useUploadInFlight();
  const uploading = (tracker?.count ?? 0) > 0;
  const blockedReason = uploading
    ? "Aguarde os uploads de fotos terminarem"
    : undefined;

  const finalize = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await finalizeVistoriaAction(vistoriaId);
          toast.success("Vistoria finalizada");
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

  const reopen = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await reopenVistoriaAction(vistoriaId);
          toast.success("Vistoria reaberta");
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

  const remove = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await deleteVistoriaFromEditPageAction(vistoriaId);
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
    <>
      <div className="flex flex-wrap gap-2">
        {status === "rascunho" ? (
          <ConfirmDialog
            title="Finalizar vistoria?"
            description="Após finalizar, ela fica em modo somente leitura. Você pode reabrir a qualquer momento."
            confirmLabel="Finalizar"
            onConfirm={finalize}
            trigger={
              <Button
                size="sm"
                disabled={pending || uploading}
                title={blockedReason}
              >
                <CheckCheck className="mr-1.5 size-4" />
                Finalizar vistoria
              </Button>
            }
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={reopen}
            className="border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/30 dark:hover:text-amber-100"
          >
            <RotateCcw className="mr-1.5 size-4" />
            Reabrir
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground disabled:opacity-50"
            aria-label="Mais ações"
            disabled={pending || uploading}
            title={blockedReason}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              render={
                <a
                  href={`/api/pdf/${vistoriaId}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <FileDown className="mr-2 size-4 text-red-600 dark:text-red-500" />
              Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive data-highlighted:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        title="Excluir vistoria?"
        description="Todos os achados criados nesta vistoria e marcações de eventos serão removidos. Achados criados em outras vistorias não são afetados."
        confirmLabel="Excluir"
        destructive
        onConfirm={remove}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
