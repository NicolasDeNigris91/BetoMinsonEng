"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { CATEGORIA_BADGE_CLASS } from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { isNextRedirectError } from "@/lib/next-errors";
import { resolveAchadoRetroactiveAction } from "@/app/(app)/empreendimentos/[id]/unidades/[uid]/actions";
import { PrazoBadge } from "@/components/prazo-badge";

export type PendenciaView = {
  id: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  prazoEm: string | null;
};

type Props = {
  trigger: React.ReactElement;
  pendencias: PendenciaView[];
};

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const UPLOAD_TIMEOUT_MS = 60_000;
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = [800, 2400];

// Duplicado vs use-photo-upload porque aqui o eventoId so existe depois
// do resolveAction (use-photo-upload recebe no construtor).
async function uploadWithRetry(eventoId: string, file: File): Promise<boolean> {
  for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt++) {
    const fd = new FormData();
    fd.set("achadoEventoId", eventoId);
    fd.set("file", file);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (res.ok) return true;
      const transient =
        res.status >= 500 || res.status === 408 || res.status === 429;
      if (!transient || attempt === UPLOAD_MAX_ATTEMPTS - 1) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          data.error ?? "Nao foi possivel anexar a foto. Tente de novo.",
        );
        return false;
      }
    } catch {
      if (attempt === UPLOAD_MAX_ATTEMPTS - 1) {
        toast.error("Falha de rede ao enviar a foto. Tente de novo.");
        return false;
      }
    }
    await new Promise((r) =>
      setTimeout(r, UPLOAD_BACKOFF_MS[attempt] ?? UPLOAD_BACKOFF_MS.at(-1)!),
    );
  }
  return false;
}

function formatBR(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ResolverPendenciasDialog({ trigger, pendencias }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Refresh defere ate fechar pra nao remover linhas durante a interacao.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && hasChanges) {
      router.refresh();
      setHasChanges(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Resolver pendências</DialogTitle>
          <DialogDescription>
            Marque os achados corrigidos. Você pode ajustar a data da
            resolução e anexar uma foto de comprovação (opcional). O
            registro fica na vistoria onde o achado foi criado, sem criar
            vistoria nova.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {pendencias.map((p) => (
            <PendenciaRow
              key={p.id}
              pendencia={p}
              onChanged={() => setHasChanges(true)}
            />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function PendenciaRow({
  pendencia,
  onChanged,
}: {
  pendencia: PendenciaView;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [resolved, setResolved] = useState(false);
  const [resolvedAt, setResolvedAt] = useState<Date | null>(null);
  const [hasFoto, setHasFoto] = useState(false);

  const [dateValue, setDateValue] = useState(() => toDatetimeLocal(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onMark = () => {
    start(async () => {
      try {
        const parsed = new Date(dateValue);
        if (Number.isNaN(parsed.getTime())) {
          toast.error("Data inválida");
          return;
        }
        const { eventoId } = await resolveAchadoRetroactiveAction(
          pendencia.id,
          "resolvido",
          parsed.toISOString(),
        );

        if (file && eventoId) {
          const ok = await uploadWithRetry(eventoId, file);
          if (ok) setHasFoto(true);
          // Upload falhou: evento ja foi criado, mantem resolvido marcado.
        }

        setResolved(true);
        setResolvedAt(parsed);
        onChanged();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  const onUndo = () => {
    start(async () => {
      try {
        await resolveAchadoRetroactiveAction(pendencia.id, "none");
        setResolved(false);
        setResolvedAt(null);
        setFile(null);
        setHasFoto(false);
        onChanged();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  return (
    <li
      className={cn(
        "rounded-md border bg-card p-3 transition-colors",
        resolved && "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10",
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-xs",
              CATEGORIA_BADGE_CLASS[pendencia.categoria],
            )}
          >
            {CATEGORIA_LABELS[pendencia.categoria]}
          </Badge>
          {pendencia.local ? (
            <span className="text-sm font-medium">{pendencia.local}</span>
          ) : null}
          <PrazoBadge prazoEm={pendencia.prazoEm} resolvido={resolved} />
        </div>
        <p className="text-sm whitespace-pre-line">{pendencia.descricao}</p>

        {resolved && resolvedAt ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-100 px-2 py-1 font-mono text-[10px] tracking-[0.06em] text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              <CheckCircle2 className="size-3.5" />
              Resolvido em{" "}
              <span className="tabular-nums">{formatBR(resolvedAt)}</span>
            </span>
            {hasFoto ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                <Paperclip className="size-3" />
                foto anexada
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onUndo}
              className="ml-auto"
            >
              <X className="mr-1 size-4" />
              Desfazer
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
              <Calendar
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <input
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                disabled={pending}
                className="bg-transparent font-mono text-[11px] tabular-nums outline-none"
                aria-label="Data da resolução"
              />
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                <Paperclip className="size-3 text-muted-foreground" />
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  disabled={pending}
                  aria-label="Remover foto"
                  className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="mr-1 size-4" />
                Anexar foto
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={onMark}
              className="ml-auto"
            >
              <CheckCircle2 className="mr-1 size-4" />
              {pending ? "Marcando..." : "Marcar resolvido"}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
