"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Lock,
  MessageSquare,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePhotoUpload } from "@/lib/use-photo-upload";
import {
  CATEGORIA_BADGE_OUTLINE_CLASS,
  CATEGORIA_STRIPE_BORDER,
} from "@/lib/category-styles";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { isNextRedirectError } from "@/lib/next-errors";
import { cn } from "@/lib/utils";
import {
  setAchadoStateViaTokenAction,
  updateNotaViaTokenAction,
} from "./actions";

export type AchadoCardData = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  prazoEm: string | null;
  /** Fotos do evento "criado" original — contexto visual do problema. */
  fotosOrigem: { id: string; thumbPath: string }[];
  /** Evento atual desse achado no escopo (null = nao tocado pelo profissional). */
  evento: {
    id: string;
    tipo: "resolvido" | "persiste";
    notaExtra: string | null;
    fotos: { id: string; thumbPath: string; arquivoPath: string }[];
  } | null;
  tratadoPorEsteFluxo: boolean;
  resolvidoEmOutro: boolean;
};

type Props = {
  token: string;
  data: AchadoCardData;
};

export function AchadoCard({ token, data }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nota, setNota] = useState(data.evento?.notaExtra ?? "");
  const [notaSaved, setNotaSaved] = useState(data.evento?.notaExtra ?? "");
  const [mode, setMode] = useState<"idle" | "persiste-edit">(
    data.evento?.tipo === "persiste" ? "persiste-edit" : "idle",
  );

  const apply = (state: "resolvido" | "persiste", notaExtra?: string) =>
    new Promise<boolean>((resolve) => {
      start(async () => {
        try {
          const result = await setAchadoStateViaTokenAction(
            token,
            data.achadoId,
            state,
            notaExtra,
          );
          if (result?.error) {
            toast.error(result.error);
            resolve(false);
            return;
          }
          router.refresh();
          resolve(true);
        } catch (err) {
          if (isNextRedirectError(err)) {
            resolve(false);
            throw err;
          }
          toast.error("Erro ao salvar. Tente novamente.");
          resolve(false);
        }
      });
    });

  const handleMarkResolvido = async () => {
    const ok = await apply("resolvido");
    if (ok) toast.success("Marcado como resolvido");
  };

  const handleStartPersiste = async () => {
    // Cria o evento ja como 'persiste' (sem nota) e abre o campo pra
    // digitar. Salva separadamente quando o usuario clicar "Salvar nota".
    if (!data.evento || data.evento.tipo !== "persiste") {
      const ok = await apply("persiste");
      if (!ok) return;
    }
    setMode("persiste-edit");
  };

  const handleSaveNota = () => {
    if (nota === notaSaved) return;
    start(async () => {
      try {
        const result = await updateNotaViaTokenAction(
          token,
          data.achadoId,
          nota,
        );
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setNotaSaved(nota);
        toast.success("Nota salva");
        router.refresh();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao salvar nota. Tente novamente.");
      }
    });
  };

  if (data.resolvidoEmOutro) {
    return (
      <article
        className={cn(
          "border border-l-4 rounded-lg bg-background p-4 opacity-70",
          CATEGORIA_STRIPE_BORDER[data.categoria],
        )}
      >
        <CardHeader data={data} />
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Ja resolvido pela engenharia ou por outro escopo.
        </p>
      </article>
    );
  }

  const tipoAtual = data.evento?.tipo ?? null;
  const evento = data.evento;

  return (
    <article
      className={cn(
        "border border-l-4 rounded-lg bg-background p-4 space-y-3",
        CATEGORIA_STRIPE_BORDER[data.categoria],
      )}
    >
      <CardHeader data={data} />

      {data.fotosOrigem.length > 0 ? (
        <div>
          <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
            Foto do problema
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data.fotosOrigem.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.id}
                src={`/api/files/${f.thumbPath}?token=${encodeURIComponent(token)}`}
                alt="Foto do problema original"
                loading="lazy"
                decoding="async"
                className="aspect-square w-full rounded-md border object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tipoAtual === "resolvido" ? "default" : "outline"}
          onClick={handleMarkResolvido}
          disabled={pending}
        >
          {pending && tipoAtual !== "resolvido" ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Check className="mr-1.5 size-4" />
          )}
          {tipoAtual === "resolvido" ? "Marcado: resolvido" : "Marcar resolvido"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tipoAtual === "persiste" ? "default" : "outline"}
          onClick={handleStartPersiste}
          disabled={pending}
        >
          <MessageSquare className="mr-1.5 size-4" />
          {tipoAtual === "persiste" ? "Marcado: persiste" : "Marcar persiste"}
        </Button>
      </div>

      {tipoAtual === "persiste" && mode === "persiste-edit" ? (
        <div className="space-y-2">
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="O que aconteceu? (ex: aguardando peca, retorno agendado para 30/05...)"
            disabled={pending}
          />
          {nota !== notaSaved ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={handleSaveNota}
            >
              <Save className="mr-1 size-4" />
              {pending ? "Salvando..." : "Salvar nota"}
            </Button>
          ) : null}
        </div>
      ) : tipoAtual === "persiste" && notaSaved ? (
        <p className="border-l-2 pl-3 text-sm italic text-muted-foreground whitespace-pre-line">
          {notaSaved}
        </p>
      ) : null}

      {evento ? <ExecutionPhotos token={token} evento={evento} /> : null}
    </article>
  );
}

function ExecutionPhotos({
  token,
  evento,
}: {
  token: string;
  evento: NonNullable<AchadoCardData["evento"]>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const onSuccess = useCallback(() => router.refresh(), [router]);
  const { upload, uploading, total, done } = usePhotoUpload({
    eventoId: evento.id,
    uploadToken: token,
    successLabel: {
      singular: "Foto enviada",
      plural: (n) => `${n} fotos enviadas`,
    },
    onSuccess,
  });

  const handleFiles = async (files: FileList | null) => {
    try {
      await upload(files);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
        <Camera className="inline-block size-3 mr-1" />
        Fotos da execucao
      </p>

      {evento.fotos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 mb-2">
          {evento.fotos.map((f) => (
            <a
              key={f.id}
              href={`/api/files/${f.arquivoPath}?token=${encodeURIComponent(token)}`}
              target="_blank"
              rel="noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${f.thumbPath}?token=${encodeURIComponent(token)}`}
                alt="Foto da execucao"
                loading="lazy"
                decoding="async"
                className="aspect-square w-full rounded-md border object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? (
          <>
            <Loader2 className="mr-1.5 size-4 animate-spin" />
            {total === 1 ? "Enviando..." : `Enviando ${done} de ${total}...`}
          </>
        ) : (
          <>
            <ImagePlus className="mr-1.5 size-4" />
            Adicionar foto
          </>
        )}
      </Button>
    </div>
  );
}

function CardHeader({ data }: { data: AchadoCardData }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-xs bg-transparent",
            CATEGORIA_BADGE_OUTLINE_CLASS[data.categoria],
          )}
        >
          {CATEGORIA_LABELS[data.categoria]}
        </Badge>
        {data.local ? (
          <span className="text-sm font-medium">{data.local}</span>
        ) : null}
      </div>
      <p className="text-sm whitespace-pre-line">{data.descricao}</p>
    </div>
  );
}
