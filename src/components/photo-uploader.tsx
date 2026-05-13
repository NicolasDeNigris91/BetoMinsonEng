"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteFotoAction,
  updateLegendaAction,
} from "@/app/(app)/empreendimentos/[id]/unidades/[uid]/vistorias/[vid]/foto-actions";

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
  const router = useRouter();
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [pending, start] = useTransition();
  const uploading = uploadTotal > 0;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadTotal(list.length);
    setUploadDone(0);

    let succeeded = 0;
    let failed = 0;
    const toastId = toast.loading(
      list.length === 1
        ? "Enviando foto..."
        : `Enviando 0 de ${list.length} fotos...`,
    );

    try {
      for (const file of list) {
        const fd = new FormData();
        fd.set("achadoEventoId", eventoId);
        fd.set("file", file);
        try {
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (res.ok) {
            succeeded += 1;
          } else {
            failed += 1;
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? `Falha no upload de ${file.name}`);
          }
        } catch {
          failed += 1;
          toast.error(`Falha no upload de ${file.name}`);
        }
        setUploadDone((d) => d + 1);
        if (list.length > 1) {
          toast.loading(
            `Enviando ${succeeded + failed} de ${list.length} fotos...`,
            { id: toastId },
          );
        }
      }

      if (succeeded > 0) {
        router.refresh();
        toast.success(
          succeeded === 1
            ? "Foto adicionada"
            : `${succeeded} fotos adicionadas`,
          { id: toastId },
        );
      } else {
        toast.dismiss(toastId);
      }
      onUploaded?.();
    } finally {
      setUploadTotal(0);
      setUploadDone(0);
      if (inputRef.current) inputRef.current.value = "";
    }
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
    <div className="space-y-3">
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
        <div>
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
                {uploadTotal === 1
                  ? "Enviando foto..."
                  : `Enviando ${uploadDone} de ${uploadTotal}...`}
              </>
            ) : (
              <>
                <ImagePlus className="mr-1.5 size-4" />
                Adicionar fotos
              </>
            )}
          </Button>
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
