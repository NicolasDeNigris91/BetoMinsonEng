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
    <div className="rounded-lg border p-4 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {CATEGORIA_LABELS[achado.categoria]}
            </Badge>
            {achado.local ? (
              <span className="text-sm font-medium">{achado.local}</span>
            ) : null}
            {achado.status === "resolvido" ? (
              <Badge>Resolvido</Badge>
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
                <Button size="sm" variant="ghost">
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
                <Button size="sm" variant="ghost" disabled={pending}>
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
