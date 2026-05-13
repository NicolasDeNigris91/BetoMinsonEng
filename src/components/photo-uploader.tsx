"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePhotoUpload } from "@/lib/use-photo-upload";
import {
  deleteFotoAction,
  updateLegendaAction,
} from "@/app/(app)/empreendimentos/[id]/unidades/[uid]/vistorias/[vid]/foto-actions";

function pickImageFiles(items: DataTransferItemList | FileList): File[] {
  const out: File[] = [];
  if (items instanceof FileList) {
    for (const f of Array.from(items)) {
      if (f.type.startsWith("image/")) out.push(f);
    }
    return out;
  }
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f && f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

export type FotoView = {
  id: string;
  arquivoPath: string;
  thumbPath: string;
  legenda: string | null;
};

type Props = {
  eventoId: string;
  fotos: FotoView[];
  editable: boolean;
  shareToken?: string;
  onUploaded?: () => void;
};

function fileUrl(path: string, token?: string): string {
  const base = `/api/files/${path}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function PhotoUploader({
  eventoId,
  fotos,
  editable,
  shareToken,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  const handleSuccess = useCallback(() => {
    router.refresh();
    onUploaded?.();
  }, [router, onUploaded]);

  const { upload, uploading, total, done } = usePhotoUpload({
    eventoId,
    onSuccess: handleSuccess,
  });

  const handleUpload = async (files: FileList | File[] | null) => {
    try {
      await upload(files);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!editable) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!editable) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const imageFiles = pickImageFiles(
      e.dataTransfer.items.length > 0
        ? e.dataTransfer.items
        : e.dataTransfer.files,
    );
    if (imageFiles.length === 0) {
      toast.error("Solte apenas imagens");
      return;
    }
    void handleUpload(imageFiles);
  };

  const handleDelete = (id: string) => {
    start(async () => {
      try {
        await deleteFotoAction(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir");
      }
    });
  };

  const handleLegendaBlur = (id: string, current: string, original: string) => {
    if (current === original) return;
    start(async () => {
      try {
        await updateLegendaAction(id, current);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    });
  };

  if (fotos.length === 0 && !editable) return null;

  return (
    <div
      className={
        editable
          ? `relative rounded-lg space-y-3 transition-colors ${
              dragOver
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5"
                : ""
            }`
          : "space-y-3"
      }
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {fotos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {fotos.map((f) => (
            <FotoCard
              key={f.id}
              foto={f}
              shareToken={shareToken}
              editable={editable}
              pending={pending}
              onDelete={() => handleDelete(f.id)}
              onLegendaBlur={(value, original) =>
                handleLegendaBlur(f.id, value, original)
              }
            />
          ))}
        </div>
      ) : null}

      {editable ? (
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading || pending}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                {total === 1
                  ? "Enviando foto..."
                  : `Enviando ${done} de ${total}...`}
              </>
            ) : (
              <>
                <ImagePlus className="mr-1.5 size-4" />
                Adicionar fotos
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            ou arraste e solte aqui
          </span>
        </div>
      ) : null}

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md">
            <Upload className="size-4" />
            Solte as fotos para enviar
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FotoCard({
  foto,
  shareToken,
  editable,
  pending,
  onDelete,
  onLegendaBlur,
}: {
  foto: FotoView;
  shareToken?: string;
  editable: boolean;
  pending: boolean;
  onDelete: () => void;
  onLegendaBlur: (value: string, original: string) => void;
}) {
  const [legenda, setLegenda] = useState(foto.legenda ?? "");
  const original = foto.legenda ?? "";

  return (
    <div className="space-y-1.5">
      <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
        <a
          href={fileUrl(foto.arquivoPath, shareToken)}
          target="_blank"
          rel="noreferrer"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(foto.thumbPath, shareToken)}
            alt={foto.legenda ?? ""}
            className="h-full w-full object-cover"
          />
        </a>
        {editable ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="absolute top-1 right-1 rounded-md bg-background/80 p-1 backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Excluir foto"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {editable ? (
        <input
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
          onBlur={() => onLegendaBlur(legenda, original)}
          placeholder="Legenda..."
          className="w-full rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : foto.legenda ? (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {foto.legenda}
        </p>
      ) : null}
    </div>
  );
}
