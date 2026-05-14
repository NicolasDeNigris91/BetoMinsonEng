"use client";

import { useTransition } from "react";
import { CheckCircle2, AlertCircle, X, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { setAchadoStateInVistoriaAction } from "./actions";
import { ensureNotaEventoAction } from "./foto-actions";
import { EventoEditor } from "./evento-editor";
import type { FotoView } from "@/components/photo-uploader";
import { toast } from "sonner";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_STRIPE_BORDER,
  EVENTO_BADGE,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";

export type ChecklistEvento = {
  id: string;
  tipo: "criado" | "persiste" | "resolvido" | "nota";
  notaExtra: string | null;
  fotos: FotoView[];
};

type Props = {
  vistoriaId: string;
  achado: {
    id: string;
    categoria: Categoria;
    local: string | null;
    descricao: string;
  };
  evento: ChecklistEvento | null;
};

export function AchadoChecklistRow({ vistoriaId, achado, evento }: Props) {
  const [pending, start] = useTransition();

  const tipo = evento?.tipo;
  const isResolvido = tipo === "resolvido";
  const isPersiste = tipo === "persiste";

  const setState = (next: "persiste" | "resolvido" | "none") => {
    start(async () => {
      try {
        await setAchadoStateInVistoriaAction(vistoriaId, achado.id, next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  const ensureNota = () => {
    start(async () => {
      try {
        await ensureNotaEventoAction(vistoriaId, achado.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  const dataState = tipo ?? "none";
  const eventoBadge = tipo && tipo !== "criado" ? EVENTO_BADGE[tipo] : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 bg-card p-4 shadow-sm transition-colors",
        CATEGORIA_STRIPE_BORDER[achado.categoria],
        "data-[state=resolvido]:bg-emerald-500/5 data-[state=persiste]:bg-amber-500/5 data-[state=nota]:bg-muted/30",
      )}
      data-state={dataState}
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
            {eventoBadge ? (
              <Badge variant="outline" className={eventoBadge.className}>
                {eventoBadge.label}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm whitespace-pre-line">{achado.descricao}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="sm"
            variant={isPersiste ? "secondary" : "ghost"}
            disabled={pending}
            onClick={() => setState("persiste")}
          >
            <AlertCircle className="mr-1 size-4" />
            Persiste
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isResolvido ? "default" : "ghost"}
            disabled={pending}
            onClick={() => setState("resolvido")}
          >
            <CheckCircle2 className="mr-1 size-4" />
            Resolvido
          </Button>
          {!evento ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Adicionar nota/foto sem mudar status"
              aria-label="Adicionar nota ou foto a este achado"
              onClick={ensureNota}
            >
              <MessageSquarePlus className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Limpar marcação (remove nota/fotos desta vistoria)"
              aria-label="Limpar marcação deste achado"
              onClick={() => setState("none")}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {evento ? (
        <div className="mt-3 ml-1 border-l-2 pl-4">
          <EventoEditor
            eventoId={evento.id}
            notaInicial={evento.notaExtra ?? ""}
            fotos={evento.fotos}
            editable
          />
        </div>
      ) : null}
    </div>
  );
}
