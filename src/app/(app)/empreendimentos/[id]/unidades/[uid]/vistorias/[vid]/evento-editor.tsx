"use client";

import { useEffect, useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PhotoUploader, type FotoView } from "@/components/photo-uploader";
import { isNextRedirectError } from "@/lib/next-errors";
import { updateEventoNotaAction } from "./foto-actions";

type Props = {
  eventoId: string;
  notaInicial: string;
  fotos: FotoView[];
  editable: boolean;
  notaPlaceholder?: string;
  shareToken?: string;
};

export function EventoEditor({
  eventoId,
  notaInicial,
  fotos,
  editable,
  notaPlaceholder = "Anotações desta visita...",
  shareToken,
}: Props) {
  const [nota, setNota] = useState(notaInicial);
  const [savedNota, setSavedNota] = useState(notaInicial);
  const [pending, start] = useTransition();
  const dirty = nota !== savedNota;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const saveNota = () => {
    start(async () => {
      try {
        await updateEventoNotaAction(eventoId, nota);
        setSavedNota(nota);
        toast.success("Nota salva");
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    });
  };

  if (!editable) {
    return (
      <div className="space-y-2">
        {notaInicial ? (
          <p className="text-sm border-l-2 border-muted-foreground/30 pl-3 italic whitespace-pre-line">
            {notaInicial}
          </p>
        ) : null}
        <PhotoUploader
          eventoId={eventoId}
          fotos={fotos}
          editable={false}
          shareToken={shareToken}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder={notaPlaceholder}
          disabled={pending}
        />
        {dirty ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={saveNota}
          >
            <Save className="mr-1 size-4" />
            {pending ? "Salvando..." : "Salvar nota"}
          </Button>
        ) : null}
      </div>
      <PhotoUploader eventoId={eventoId} fotos={fotos} editable={editable} />
    </div>
  );
}
