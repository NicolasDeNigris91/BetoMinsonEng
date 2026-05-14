"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Check, Highlighter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoEditor } from "@/components/photo-editor";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { usePhotoUpload } from "@/lib/use-photo-upload";

type Item = {
  eventoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  fotos: { id: string; thumbPath: string }[];
};

type Props = {
  token: string;
  items: Item[];
};

export function MobileUploader({ token, items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        Nenhum achado nesta vistoria ainda. Crie achados pelo desktop antes de
        subir fotos.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <MobileUploadCard key={item.eventoId} item={item} token={token} />
      ))}
    </ul>
  );
}

const SUCCESS_LABEL = {
  singular: "Foto enviada",
  plural: (n: number) => `${n} fotos enviadas`,
};

function MobileUploadCard({ item, token }: { item: Item; token: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [recentCount, setRecentCount] = useState(0);
  const [editorQueue, setEditorQueue] = useState<{
    remaining: File[];
    processed: File[];
  } | null>(null);

  const handleSuccess = useCallback(
    (n: number) => {
      setRecentCount((c) => c + n);
      router.refresh();
    },
    [router],
  );

  const { upload, uploading } = usePhotoUpload({
    eventoId: item.eventoId,
    uploadToken: token,
    successLabel: SUCCESS_LABEL,
    onSuccess: handleSuccess,
  });

  const handleUpload = async (files: FileList | File[] | null) => {
    try {
      await upload(files);
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  const startEditFlow = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEditorQueue({ remaining: Array.from(files), processed: [] });
  };

  const advanceEditor = (next: File) => {
    setEditorQueue((q) => {
      if (!q) return null;
      const remaining = q.remaining.slice(1);
      const processed = [...q.processed, next];
      if (remaining.length === 0) {
        void handleUpload(processed);
        return null;
      }
      return { remaining, processed };
    });
  };

  const handleEditorCancel = () => {
    setEditorQueue(null);
    if (editRef.current) editRef.current.value = "";
  };

  return (
    <li className="rounded-lg border bg-background p-4 space-y-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {CATEGORIA_LABELS[item.categoria]}
          </Badge>
          {item.local ? (
            <span className="text-sm font-medium">{item.local}</span>
          ) : null}
        </div>
        <p className="text-sm whitespace-pre-line">{item.descricao}</p>
      </div>

      {item.fotos.length > 0 || recentCount > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {recentCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <Check className="size-3.5" />
              +{recentCount} nova{recentCount === 1 ? "" : "s"} nesta sessão
            </span>
          ) : null}
          {item.fotos.length > 0 ? (
            <span>
              {item.fotos.length} foto{item.fotos.length === 1 ? "" : "s"} já no
              achado
            </span>
          ) : null}
        </div>
      ) : null}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
      <input
        ref={editRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          startEditFlow(e.target.files);
          if (editRef.current) editRef.current.value = "";
        }}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="default"
          disabled={uploading || editorQueue !== null}
          onClick={() => cameraRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Camera className="mr-1.5 size-4" />
          )}
          Tirar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={uploading || editorQueue !== null}
          onClick={() => galleryRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 size-4" />
          )}
          Da galeria
        </Button>
        <Button
          type="button"
          variant="outline"
          className="col-span-2"
          disabled={uploading || editorQueue !== null}
          onClick={() => editRef.current?.click()}
        >
          <Highlighter className="mr-1.5 size-4" />
          Marcar e enviar
        </Button>
      </div>

      {editorQueue && editorQueue.remaining[0] ? (
        <PhotoEditor
          key={`${editorQueue.processed.length}-${editorQueue.remaining[0].name}-${editorQueue.remaining[0].size}`}
          file={editorQueue.remaining[0]}
          queueLabel={
            editorQueue.remaining.length + editorQueue.processed.length > 1
              ? `${editorQueue.processed.length + 1} / ${
                  editorQueue.processed.length + editorQueue.remaining.length
                }`
              : undefined
          }
          onConfirm={(edited) => advanceEditor(edited)}
          onSkip={() => {
            const original = editorQueue.remaining[0];
            if (original) advanceEditor(original);
          }}
          onCancel={handleEditorCancel}
        />
      ) : null}
    </li>
  );
}
