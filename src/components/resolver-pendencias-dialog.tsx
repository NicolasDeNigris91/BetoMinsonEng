"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
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
import { setAchadoStateInVistoriaAction } from "@/app/(app)/empreendimentos/[id]/unidades/[uid]/vistorias/[vid]/actions";
import { ensureRascunhoForUnidadeAction } from "@/app/(app)/empreendimentos/[id]/unidades/[uid]/actions";

export type PendenciaView = {
  id: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  /** Estado ja marcado nesta vistoria rascunho, se houver. */
  currentTipo: "persiste" | "resolvido" | null;
};

type Props = {
  trigger: React.ReactElement;
  pendencias: PendenciaView[];
} & (
  | {
      /** Modo direto: rascunho ja existe, marcacoes vao direto pra ela. */
      vistoriaId: string;
      unidadeId?: never;
    }
  | {
      /** Modo lazy: o dialog cria/encontra a rascunho na primeira marcacao. */
      unidadeId: string;
      vistoriaId?: never;
    }
);

export function ResolverPendenciasDialog({
  trigger,
  pendencias,
  vistoriaId: initialVistoriaId,
  unidadeId,
}: Props) {
  const [open, setOpen] = useState(false);
  // Quando entra em modo lazy (unidadeId), so resolve a vistoria na primeira
  // marcacao — assim abrir e fechar o dialog sem clicar nada NAO cria
  // rascunho fantasma.
  const [vistoriaId, setVistoriaId] = useState<string | null>(
    initialVistoriaId ?? null,
  );
  const [ensuring, setEnsuring] = useState(false);

  const ensureVistoria = async (): Promise<string> => {
    if (vistoriaId) return vistoriaId;
    if (!unidadeId) throw new Error("Faltou unidadeId em modo lazy.");
    setEnsuring(true);
    try {
      const { vistoriaId: id } = await ensureRascunhoForUnidadeAction(
        unidadeId,
      );
      setVistoriaId(id);
      return id;
    } finally {
      setEnsuring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Resolver pendências</DialogTitle>
          <DialogDescription>
            Achados em aberto da unidade. Marque cada um como{" "}
            <strong>Resolvido</strong> ou que <strong>Persiste</strong>.
            {!initialVistoriaId && !vistoriaId ? (
              <>
                {" "}
                Uma vistoria rascunho de hoje será criada automaticamente
                pra registrar as marcações.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {pendencias.map((p) => (
            <PendenciaRow
              key={p.id}
              ensureVistoria={ensureVistoria}
              ensuring={ensuring}
              pendencia={p}
            />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function PendenciaRow({
  ensureVistoria,
  ensuring,
  pendencia,
}: {
  ensureVistoria: () => Promise<string>;
  ensuring: boolean;
  pendencia: PendenciaView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState(pendencia.currentTipo);

  const setState = (next: "persiste" | "resolvido" | "none") => {
    start(async () => {
      try {
        const vid = await ensureVistoria();
        await setAchadoStateInVistoriaAction(vid, pendencia.id, next);
        setTipo(next === "none" ? null : next);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  const disabled = pending || ensuring;

  return (
    <li className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
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
          </div>
          <p className="text-sm whitespace-pre-line">{pendencia.descricao}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              setState(tipo === "persiste" ? "none" : "persiste")
            }
            aria-pressed={tipo === "persiste"}
            className={cn(
              tipo === "persiste" &&
                "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60",
            )}
          >
            <AlertCircle className="mr-1 size-4" />
            Persiste
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              setState(tipo === "resolvido" ? "none" : "resolvido")
            }
            aria-pressed={tipo === "resolvido"}
            className={cn(
              tipo === "resolvido" &&
                "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60",
            )}
          >
            <CheckCircle2 className="mr-1 size-4" />
            Resolvido
          </Button>
        </div>
      </div>
    </li>
  );
}
