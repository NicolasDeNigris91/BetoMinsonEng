"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useShortcut } from "@/lib/use-shortcut";
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

  // Atalho "n" abre o dialog de novo achado. So registramos no modo
  // create — a versao de edit nao deve abrir nem por engano.
  useShortcut("n", () => setOpen(true), {
    enabled: !isEdit && !open,
  });

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
      <DialogContent className="rounded-none border-t-2 border-t-foreground">
        <DialogHeader>
          <DialogTitle className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {isEdit ? "Editar achado" : "Novo achado"}
          </DialogTitle>
          <DialogDescription className="-mt-1 text-[20px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            {isEdit
              ? "Ajustar descrição, local e matéria"
              : "Categoria, local e descrição"}
          </DialogDescription>
        </DialogHeader>

        {visibleTemplates.length > 0 ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Templates frequentes
            </p>
            <ul className="border-y">
              {visibleTemplates.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => applyTemplate(t)}
                    disabled={pending}
                    className="grid w-full grid-cols-[10px_1fr_auto] items-baseline gap-3 border-b border-dashed py-1.5 text-left last:border-b-0 hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40 disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 self-center rounded-full",
                        CATEGORIA_DOT[t.categoria],
                      )}
                    />
                    <span className="min-w-0 text-xs">
                      {t.local ? (
                        <span className="font-semibold">{t.local}</span>
                      ) : (
                        <span className="font-semibold text-muted-foreground">
                          {CATEGORIA_LABELS[t.categoria]}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {" — "}
                        {t.descricao}
                      </span>
                    </span>
                    <span className="font-mono text-[9.5px] tracking-[0.04em] text-muted-foreground">
                      {String(t.uso).padStart(2, "0")}×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {hasMoreTemplates ? (
              <button
                type="button"
                onClick={() => setShowAllTemplates(true)}
                className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground"
              >
                Ver mais {templates.length - 4} →
              </button>
            ) : null}
          </div>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="categoria"
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground"
            >
              Matéria
            </Label>
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
            <Label
              htmlFor="local"
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground"
            >
              Local
            </Label>
            <Input
              id="local"
              name="local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Térreo — sala de estar"
              disabled={pending}
            />
            {state.fieldErrors?.local ? (
              <p className="text-sm text-destructive">{state.fieldErrors.local}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="descricao"
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground"
            >
              Descrição
            </Label>
            <Textarea
              id="descricao"
              name="descricao"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              placeholder="O que foi encontrado, o que precisa ser feito"
              disabled={pending}
            />
            {state.fieldErrors?.descricao ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.descricao}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="prazoEm"
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground"
            >
              Prazo
            </Label>
            <Input
              id="prazoEm"
              name="prazoEm"
              type="date"
              value={prazoEm}
              onChange={(e) => setPrazoEm(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Vence em — passa a aparecer como atrasado.
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

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
