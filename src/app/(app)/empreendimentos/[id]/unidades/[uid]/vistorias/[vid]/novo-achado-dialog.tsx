"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIA_LABELS,
  categoriaEnum,
  type Achado,
  type Categoria,
} from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import {
  createAchadoAction,
  updateAchadoAction,
  type NovoAchadoState,
} from "./actions";

export type AchadoTemplate = {
  categoria: Categoria;
  local: string | null;
  descricao: string;
  uso: number;
};

type Props = {
  vistoriaId: string;
  achado?: Achado;
  trigger?: React.ReactElement;
  /** Templates frequentes — exibe painel acima do form. Omitir/array vazio
   *  esconde o painel. Ignorado em modo de edicao. */
  templates?: AchadoTemplate[];
};

export function AchadoFormDialog({
  vistoriaId,
  achado,
  trigger,
  templates = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(achado);

  // Form controlado pra permitir pre-fill via clique em template.
  const [categoria, setCategoria] = useState<Categoria>(
    achado?.categoria ?? "ELE",
  );
  const [local, setLocal] = useState<string>(achado?.local ?? "");
  const [descricao, setDescricao] = useState<string>(achado?.descricao ?? "");
  const [prazoEm, setPrazoEm] = useState<string>(achado?.prazoEm ?? "");
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const action = isEdit
    ? updateAchadoAction.bind(null, achado!.id, vistoriaId)
    : createAchadoAction.bind(null, vistoriaId);

  const [state, formAction, pending] = useActionState<NovoAchadoState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (!result.fieldErrors && !result.error) {
        setOpen(false);
        // Reset pra proxima abertura (so importa em modo "novo").
        if (!isEdit) {
          setCategoria("ELE");
          setLocal("");
          setDescricao("");
          setPrazoEm("");
        }
      }
      return result;
    },
    {},
  );

  const applyTemplate = (t: AchadoTemplate) => {
    setCategoria(t.categoria);
    setLocal(t.local ?? "");
    setDescricao(t.descricao);
  };

  const visibleTemplates =
    !isEdit && templates.length > 0
      ? showAllTemplates
        ? templates
        : templates.slice(0, 4)
      : [];

  const hasMoreTemplates =
    !isEdit && !showAllTemplates && templates.length > 4;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <Plus className="mr-1.5 size-4" />
              Novo achado
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar achado" : "Novo achado nesta vistoria"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ajustes em descrição, local e matéria."
              : "Categoria, local e descrição do que foi encontrado."}
          </DialogDescription>
        </DialogHeader>

        {visibleTemplates.length > 0 ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Templates frequentes
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleTemplates.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  disabled={pending}
                  className="group flex items-start gap-2 rounded-md border bg-card p-2 text-left transition-colors hover:border-brand/40 hover:bg-brand/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 inline-block size-2 shrink-0 rounded-full",
                      CATEGORIA_DOT[t.categoria],
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {t.local ? (
                      <p className="truncate text-xs font-medium">{t.local}</p>
                    ) : (
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {CATEGORIA_LABELS[t.categoria]}
                      </p>
                    )}
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">
                      {t.descricao}
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.06em] text-muted-foreground/70">
                      usado {String(t.uso).padStart(2, "0")}×
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {hasMoreTemplates ? (
              <button
                type="button"
                onClick={() => setShowAllTemplates(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Ver mais {templates.length - 4} templates →
              </button>
            ) : null}
            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/70">
                ou criar manual
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categoria">Matéria*</Label>
            <Select
              name="categoria"
              value={categoria}
              onValueChange={(v) => setCategoria(v as Categoria)}
              disabled={pending}
            >
              <SelectTrigger id="categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoriaEnum.enumValues.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span
                      className={cn(
                        "inline-block size-2.5 shrink-0 rounded-full",
                        CATEGORIA_DOT[c],
                      )}
                      aria-hidden
                    />
                    <span>
                      {CATEGORIA_LABELS[c]}{" "}
                      <span className="text-muted-foreground">({c})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.categoria ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.categoria}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="local">Local</Label>
            <Input
              id="local"
              name="local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex: Térreo - sala de estar"
              disabled={pending}
            />
            {state.fieldErrors?.local ? (
              <p className="text-sm text-destructive">{state.fieldErrors.local}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição*</Label>
            <Textarea
              id="descricao"
              name="descricao"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              placeholder="O que foi encontrado, o que precisa ser feito..."
              disabled={pending}
            />
            {state.fieldErrors?.descricao ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.descricao}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="prazoEm">Resolver até (opcional)</Label>
            <Input
              id="prazoEm"
              name="prazoEm"
              type="date"
              value={prazoEm}
              onChange={(e) => setPrazoEm(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Achado fica marcado como atrasado depois desta data.
            </p>
            {state.fieldErrors?.prazoEm ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.prazoEm}
              </p>
            ) : null}
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : isEdit ? "Salvar" : "Criar achado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
