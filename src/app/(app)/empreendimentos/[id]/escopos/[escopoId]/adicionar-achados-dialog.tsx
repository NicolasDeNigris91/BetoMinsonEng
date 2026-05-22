"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CATEGORIA_LABELS,
  categoriaEnum,
  type Categoria,
} from "@/db/schema";
import {
  CATEGORIA_BADGE_CLASS,
  CATEGORIA_DOT,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isNextRedirectError } from "@/lib/next-errors";
import { addAchadosToEscopoAction } from "../actions";

export type CandidatoAchado = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  status: "aberto" | "resolvido";
  prazoEm: string | null;
  unidadeId: string;
  unidadeNome: string;
  unidadeOrdem: number;
};

type Props = {
  escopoId: string;
  empreendimentoId: string;
  jaNoEscopo: string[];
  candidatos: CandidatoAchado[];
  triggerLabel?: string;
  /** Quando true, o botao trigger usa estilo primary (CTA do empty state). */
  primary?: boolean;
};

export function AdicionarAchadosDialog({
  escopoId,
  jaNoEscopo,
  candidatos,
  triggerLabel,
  primary,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categorias, setCategorias] = useState<Set<Categoria>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const jaSet = useMemo(() => new Set(jaNoEscopo), [jaNoEscopo]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidatos.filter((c) => {
      if (categorias.size > 0 && !categorias.has(c.categoria)) return false;
      if (!q) return true;
      const hay = `${c.local ?? ""} ${c.descricao} ${c.unidadeNome}`.toLowerCase();
      return hay.includes(q);
    });
  }, [candidatos, query, categorias]);

  // Agrupar por unidade pra render.
  const grupos = useMemo(() => {
    const map = new Map<
      string,
      { unidadeId: string; unidadeNome: string; itens: CandidatoAchado[] }
    >();
    for (const c of filtrados) {
      const g = map.get(c.unidadeId);
      if (g) g.itens.push(c);
      else
        map.set(c.unidadeId, {
          unidadeId: c.unidadeId,
          unidadeNome: c.unidadeNome,
          itens: [c],
        });
    }
    return Array.from(map.values());
  }, [filtrados]);

  const toggleAchado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategoria = (cat: Categoria) => {
    setCategorias((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleGrupo = (itens: CandidatoAchado[]) => {
    const selecionaveis = itens.filter((it) => !jaSet.has(it.achadoId));
    const allSelected = selecionaveis.every((it) =>
      selecionados.has(it.achadoId),
    );
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const it of selecionaveis) {
        if (allSelected) next.delete(it.achadoId);
        else next.add(it.achadoId);
      }
      return next;
    });
  };

  const novosSelecionados = Array.from(selecionados).filter(
    (id) => !jaSet.has(id),
  );

  const onSubmit = () => {
    if (novosSelecionados.length === 0) return;
    start(async () => {
      try {
        const result = await addAchadosToEscopoAction(
          escopoId,
          novosSelecionados,
        );
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `${novosSelecionados.length} ${
            novosSelecionados.length === 1
              ? "achado adicionado"
              : "achados adicionados"
          }`,
        );
        setSelecionados(new Set());
        setQuery("");
        setCategorias(new Set());
        setOpen(false);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao adicionar. Tente novamente.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          primary ? (
            <Button>
              <Plus className="mr-1.5 size-4" />
              {triggerLabel ?? "Adicionar achados"}
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 size-4" />
              {triggerLabel ?? "Adicionar achados"}
            </Button>
          )
        }
      />
      <DialogContent
        className="flex max-h-[85vh] w-[95vw] flex-col rounded-none border-t-2 border-t-foreground sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Adicionar achados ao escopo
          </DialogTitle>
          <DialogDescription className="-mt-1 text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            Achados em aberto deste empreendimento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por local, descrição ou unidade..."
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Matéria:
            </span>
            {categoriaEnum.enumValues.map((cat) => {
              const active = categorias.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategoria(cat)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-1.5 rounded-full",
                      CATEGORIA_DOT[cat],
                    )}
                  />
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-md border bg-card">
          {grupos.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Nenhum achado bate com o filtro
              </p>
            </div>
          ) : (
            grupos.map((g) => {
              const selecionaveis = g.itens.filter(
                (it) => !jaSet.has(it.achadoId),
              );
              const allSelected =
                selecionaveis.length > 0 &&
                selecionaveis.every((it) => selecionados.has(it.achadoId));
              return (
                <div
                  key={g.unidadeId}
                  className="border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2 border-b border-dashed border-border bg-muted/30 px-3 py-2">
                    <Checkbox
                      checked={allSelected}
                      disabled={selecionaveis.length === 0}
                      onCheckedChange={() => toggleGrupo(g.itens)}
                      aria-label={`Selecionar todos de ${g.unidadeNome}`}
                    />
                    <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                      {g.unidadeNome} ·{" "}
                      <span className="tabular-nums">
                        {String(g.itens.length).padStart(2, "0")}
                      </span>{" "}
                      {g.itens.length === 1 ? "achado" : "achados"}
                    </p>
                  </div>
                  <ul>
                    {g.itens.map((it) => {
                      const isJa = jaSet.has(it.achadoId);
                      const isChecked = selecionados.has(it.achadoId);
                      return (
                        <li
                          key={it.achadoId}
                          className={cn(
                            "flex items-start gap-2 border-b border-border/50 px-3 py-2 last:border-b-0 hover:bg-muted/20",
                            isJa && "opacity-60",
                          )}
                        >
                          <Checkbox
                            checked={isJa || isChecked}
                            disabled={isJa}
                            onCheckedChange={() => toggleAchado(it.achadoId)}
                            aria-label={`Selecionar achado ${it.descricao}`}
                            className="mt-1"
                          />
                          <label
                            htmlFor={`achado-${it.achadoId}`}
                            className={cn(
                              "min-w-0 flex-1",
                              !isJa && "cursor-pointer",
                            )}
                            onClick={() => {
                              if (!isJa) toggleAchado(it.achadoId);
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-mono text-[11px]",
                                  CATEGORIA_BADGE_CLASS[it.categoria],
                                )}
                              >
                                {CATEGORIA_LABELS[it.categoria]}
                              </Badge>
                              {it.local ? (
                                <span className="text-sm font-medium">
                                  {it.local}
                                </span>
                              ) : null}
                              {isJa ? (
                                <span className="rounded-full border border-border bg-muted/50 px-2 py-[1px] font-mono text-[10px] text-muted-foreground">
                                  já no escopo
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-sm text-foreground/80">
                              {it.descricao}
                            </p>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground tabular-nums">
              {novosSelecionados.length}
            </strong>{" "}
            {novosSelecionados.length === 1
              ? "novo selecionado"
              : "novos selecionados"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || novosSelecionados.length === 0}
              onClick={onSubmit}
            >
              {pending ? "Adicionando..." : "Adicionar selecionados"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
