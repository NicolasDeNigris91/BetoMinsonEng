"use client";

import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CATEGORIA_LABELS,
  type Achado,
} from "@/db/schema";
import { AchadoFormDialog } from "./novo-achado-dialog";
import { deleteAchadoAction } from "./actions";
import { EventoEditor } from "./evento-editor";
import type { FotoView } from "@/components/photo-uploader";
import { toast } from "sonner";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_STRIPE_BORDER,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";

type Props = {
  vistoriaId: string;
  achado: Achado;
  editable: boolean;
  evento: {
    id: string;
    notaExtra: string | null;
    fotos: FotoView[];
  };
  shareToken?: string;
};

export function NovoAchadoCard({
  vistoriaId,
  achado,
  editable,
  evento,
  shareToken,
}: Props) {
  const [pending, start] = useTransition();

  const handleDelete = () => {
    return new Promise<void>((resolve) => {
      start(async () => {
        try {
          await deleteAchadoAction(achado.id, vistoriaId);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro inesperado");
        } finally {
          resolve();
        }
      });
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 bg-card p-4 shadow-sm",
        CATEGORIA_STRIPE_BORDER[achado.categoria],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("font-mono text-xs", CATEGORIA_BADGE_CLASS[achado.categoria])}
            >
              {CATEGORIA_LABELS[achado.categoria]}
            </Badge>
            {achado.local ? (
              <span className="text-sm font-medium">{achado.local}</span>
            ) : null}
            {achado.status === "resolvido" ? (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
              >
                Resolvido
              </Badge>
            ) : null}
          </div>
          <p className="text-sm whitespace-pre-line">{achado.descricao}</p>
        </div>
        {editable ? (
          <div className="flex shrink-0 gap-1">
            <AchadoFormDialog
              vistoriaId={vistoriaId}
              achado={achado}
              trigger={
                <Button size="sm" variant="ghost" aria-label="Editar achado">
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <ConfirmDialog
              title="Excluir achado?"
              description="Esta ação remove o achado e todas as fotos/eventos relacionados."
              destructive
              confirmLabel="Excluir"
              onConfirm={handleDelete}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label="Excluir achado"
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      <div className="mt-3 ml-1">
        <EventoEditor
          eventoId={evento.id}
          notaInicial={evento.notaExtra ?? ""}
          fotos={evento.fotos}
          editable={editable}
          notaPlaceholder="Detalhes adicionais..."
          shareToken={shareToken}
        />
      </div>
    </div>
  );
}
