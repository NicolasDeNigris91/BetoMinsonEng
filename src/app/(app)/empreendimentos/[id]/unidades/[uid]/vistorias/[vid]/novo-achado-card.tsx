"use client";

import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CATEGORIA_LABELS,
  type Achado,
  type EventoTipo,
} from "@/db/schema";
import { AchadoFormDialog } from "./novo-achado-dialog";
import { deleteAchadoAction } from "./actions";
import { EventoEditor } from "./evento-editor";
import type { FotoView } from "@/components/photo-uploader";
import { PrazoBadge } from "@/components/prazo-badge";
import { toast } from "sonner";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_DOT,
  CATEGORIA_STRIPE_BORDER,
  EVENTO_BADGE,
} from "@/lib/category-styles";
import { formatDateTime, type DateFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isNextRedirectError } from "@/lib/next-errors";

function fileUrl(path: string, token?: string): string {
  const base = `/api/files/${path}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

const TIPO_LABEL: Record<EventoTipo, string> = {
  criado: "achado criado",
  resolvido: "resolvido",
  persiste: "persiste",
  nota: "anotação",
};

const TIPO_COLOR: Record<EventoTipo, string> = {
  criado: "text-amber-700 dark:text-amber-300",
  resolvido: "text-emerald-700 dark:text-emerald-300",
  persiste: "text-amber-700 dark:text-amber-300",
  nota: "text-muted-foreground",
};

type Props = {
  vistoriaId: string;
  achado: Achado;
  editable: boolean;
  /** Vistoriador da vistoria — exibido como autor na linha de audit. */
  autor: string | null;
  evento: {
    id: string;
    tipo: EventoTipo;
    createdAt: Date;
    notaExtra: string | null;
    fotos: FotoView[];
  };
  shareToken?: string;
  dateFmt: DateFormat;
};

export function NovoAchadoCard({
  vistoriaId,
  achado,
  editable,
  autor,
  evento,
  shareToken,
  dateFmt,
}: Props) {
  const [pending, start] = useTransition();

  const handleDelete = () => {
    return new Promise<void>((resolve) => {
      start(async () => {
        try {
          const result = await deleteAchadoAction(achado.id, vistoriaId);
          if (result?.error) toast.error(result.error);
        } catch (err) {
          if (isNextRedirectError(err)) {
            resolve();
            throw err;
          }
          toast.error("Erro ao excluir. Tente novamente.");
        } finally {
          resolve();
        }
      });
    });
  };

  // Badge do evento (RESOLVIDO/PERSISTE/ANOTAÇÃO). "criado" nao recebe
  // badge — eh o estado default.
  const eventoBadge = EVENTO_BADGE[evento.tipo];

  const header = (
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
      {eventoBadge ? (
        <Badge variant="outline" className={eventoBadge.className}>
          {eventoBadge.label}
        </Badge>
      ) : null}
      <PrazoBadge
        prazoEm={achado.prazoEm}
        resolvido={achado.status === "resolvido"}
      />
    </div>
  );

  const auditLine = (
    <p className="flex flex-wrap items-center gap-x-2 font-mono text-[11px]">
      <span
        aria-hidden
        className={cn(
          "inline-block size-1.5 rounded-full",
          CATEGORIA_DOT[achado.categoria],
        )}
      />
      <span className="text-foreground/80">
        {CATEGORIA_LABELS[achado.categoria].toLowerCase()}
      </span>
      <span className={cn("font-semibold", TIPO_COLOR[evento.tipo])}>
        {TIPO_LABEL[evento.tipo]}
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums text-muted-foreground">
        {formatDateTime(evento.createdAt, dateFmt)}
      </span>
      {autor ? (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{autor}</span>
        </>
      ) : null}
    </p>
  );

  // Modo leitura: media-object com fotos a esquerda e texto a direita,
  // empilhado no mobile. Aproveita o branco da direita que sobra em
  // desktop com cards de 1 foto.
  if (!editable) {
    const hasFotos = evento.fotos.length > 0;
    return (
      <div
        className={cn(
          "rounded-lg border border-l-4 bg-card p-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
          CATEGORIA_STRIPE_BORDER[achado.categoria],
        )}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {hasFotos ? (
            <div className="md:w-72 md:shrink-0">
              <div
                className={cn(
                  "grid gap-2",
                  evento.fotos.length === 1 ? "grid-cols-1" : "grid-cols-2",
                )}
              >
                {evento.fotos.map((f) => (
                  <figure key={f.id} className="space-y-1">
                    <a
                      href={fileUrl(f.arquivoPath, shareToken)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileUrl(f.thumbPath, shareToken)}
                        alt={
                          f.legenda ??
                          `Foto do achado em ${CATEGORIA_LABELS[achado.categoria]}${
                            achado.local ? ` — ${achado.local}` : ""
                          }`
                        }
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full rounded-md border object-cover"
                      />
                    </a>
                    {f.legenda ? (
                      <figcaption className="text-xs text-muted-foreground line-clamp-2">
                        {f.legenda}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            {header}
            <p className="text-sm whitespace-pre-line">{achado.descricao}</p>
            {evento.notaExtra ? (
              <p className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic whitespace-pre-line">
                {evento.notaExtra}
              </p>
            ) : null}
            {auditLine}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 bg-card p-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
        CATEGORIA_STRIPE_BORDER[achado.categoria],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          {header}
          <p className="text-sm whitespace-pre-line">{achado.descricao}</p>
        </div>
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
