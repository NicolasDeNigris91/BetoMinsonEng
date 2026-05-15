"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
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
import { resolveAchadoRetroactiveAction } from "@/app/(app)/empreendimentos/[id]/unidades/[uid]/actions";

export type PendenciaView = {
  id: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  /** Se ja foi marcado como resolvido. Permite undo (clicar de novo). */
  alreadyResolved?: boolean;
};

type Props = {
  trigger: React.ReactElement;
  pendencias: PendenciaView[];
};

/**
 * Dialog "Resolver pendencias" — disparado do header da pagina da unidade.
 * Cada marcacao grava um evento "resolvido" na vistoria de origem do achado,
 * sem criar vistoria nova. Quando o evento ja existe, o botao fica
 * marcado em verde e clicar de novo desfaz.
 */
export function ResolverPendenciasDialog({ trigger, pendencias }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Resolver pendências</DialogTitle>
          <DialogDescription>
            Marque os achados que já foram corrigidos. A resolução fica
            registrada na vistoria onde o achado foi criado, com data e
            hora atuais — sem criar uma vistoria nova.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {pendencias.map((p) => (
            <PendenciaRow key={p.id} pendencia={p} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function PendenciaRow({ pendencia }: { pendencia: PendenciaView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolved, setResolved] = useState(Boolean(pendencia.alreadyResolved));

  const toggle = () => {
    const next = resolved ? "none" : "resolvido";
    start(async () => {
      try {
        await resolveAchadoRetroactiveAction(pendencia.id, next);
        setResolved(next === "resolvido");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={toggle}
          aria-pressed={resolved}
          className={cn(
            "shrink-0",
            resolved &&
              "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60",
          )}
        >
          <CheckCircle2 className="mr-1 size-4" />
          {resolved ? "Resolvido" : "Marcar resolvido"}
        </Button>
      </div>
    </li>
  );
}
