"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";

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

function MobileUploadCard({ item, token }: { item: Item; token: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [recentCount, setRecentCount] = useState(0);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);

    let succeeded = 0;
    let failed = 0;
    const toastId = toast.loading(
      list.length === 1
        ? "Enviando foto..."
        : `Enviando 0 de ${list.length} fotos...`,
    );

    try {
      const uploadUrl = `/api/upload?token=${encodeURIComponent(token)}`;
      for (const file of list) {
        const fd = new FormData();
        fd.set("achadoEventoId", item.eventoId);
        fd.set("file", file);
        try {
          const res = await fetch(uploadUrl, { method: "POST", body: fd });
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
        if (list.length > 1) {
          toast.loading(
            `Enviando ${succeeded + failed} de ${list.length} fotos...`,
            { id: toastId },
          );
        }
      }

      if (succeeded > 0) {
        setRecentCount((c) => c + succeeded);
        toast.success(
          succeeded === 1 ? "Foto enviada" : `${succeeded} fotos enviadas`,
          { id: toastId },
        );
        router.refresh();
      } else {
        toast.dismiss(toastId);
      }
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
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

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="default"
          disabled={uploading}
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
          disabled={uploading}
          onClick={() => galleryRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 size-4" />
          )}
          Da galeria
        </Button>
      </div>
    </li>
  );
}
