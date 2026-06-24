"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
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
import {
  atribuirAchadosAction,
  loadCandidatosPorEmpreendimentoAction,
  type CandidatoAchado,
} from "../actions";

export type EmpreendimentoDisponivel = {
  id: string;
  nome: string;
  disponiveis: number;
};

type Props = {
  funcionarioId: string;
  empreendimentos: EmpreendimentoDisponivel[];
  triggerLabel?: string;
  primary?: boolean;
};

type Step = "empreendimento" | "achados";

export function AtribuirAchadosDialog({
  funcionarioId,
  empreendimentos,
  triggerLabel,
  primary,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("empreendimento");
  const [empSel, setEmpSel] = useState<EmpreendimentoDisponivel | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatoAchado[]>([]);
  const [atLimit, setAtLimit] = useState(false);
  const [loadingCandidatos, setLoadingCandidatos] = useState(false);

  const [query, setQuery] = useState("");
  const [categorias, setCategorias] = useState<Set<Categoria>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [savePending, startSave] = useTransition();

  const resetEtapa2 = () => {
    setQuery("");
    setCategorias(new Set());
    setSelecionados(new Set());
    setCandidatos([]);
    setAtLimit(false);
  };

  const voltarParaEmpreendimentos = () => {
    setStep("empreendimento");
    setEmpSel(null);
    resetEtapa2();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      voltarParaEmpreendimentos();
    }
  };

  const escolherEmpreendimento = (emp: EmpreendimentoDisponivel) => {
    setEmpSel(emp);
    setStep("achados");
    setLoadingCandidatos(true);
    void (async () => {
      try {
        const result = await loadCandidatosPorEmpreendimentoAction(
          funcionarioId,
          emp.id,
        );
        if ("error" in result) {
          toast.error(result.error);
          voltarParaEmpreendimentos();
          return;
        }
        setCandidatos(result.data.candidatos);
        setAtLimit(result.data.atLimit);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao carregar achados. Tente novamente.");
        voltarParaEmpreendimentos();
      } finally {
        setLoadingCandidatos(false);
      }
    })();
  };

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidatos.filter((c) => {
      if (categorias.size > 0 && !categorias.has(c.categoria)) return false;
      if (!q) return true;
      const hay = `${c.local ?? ""} ${c.descricao} ${c.unidadeNome}`.toLowerCase();
      return hay.includes(q);
    });
  }, [candidatos, query, categorias]);

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
    const allSelected = itens.every((it) => selecionados.has(it.achadoId));
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const it of itens) {
        if (allSelected) next.delete(it.achadoId);
        else next.add(it.achadoId);
      }
      return next;
    });
  };

  const novosSelecionados = Array.from(selecionados);

  const onSubmit = () => {
    if (novosSelecionados.length === 0) return;
    startSave(async () => {
      try {
        const result = await atribuirAchadosAction(
          funcionarioId,
          novosSelecionados,
        );
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `${novosSelecionados.length} ${
            novosSelecionados.length === 1
              ? "achado atribuído"
              : "achados atribuídos"
          }`,
        );
        voltarParaEmpreendimentos();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao atribuir. Tente novamente.");
      }
    });
  };

  const triggerBtn = primary ? (
    <Button>
      <Plus className="mr-1.5 size-4" />
      {triggerLabel ?? "Atribuir achados"}
    </Button>
  ) : (
    <Button variant="outline" size="sm">
      <Plus className="mr-1.5 size-4" />
      {triggerLabel ?? "Atribuir achados"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={triggerBtn} />
      <DialogContent
        className="flex max-h-[85vh] w-[95vw] flex-col rounded-none border-t-2 border-t-foreground sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Atribuir achados ao funcionário
          </DialogTitle>
          <DialogDescription className="-mt-1 text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            {step === "empreendimento"
              ? "Escolha o empreendimento"
              : empSel?.nome ?? "Achados"}
          </DialogDescription>
        </DialogHeader>

        {step === "empreendimento" ? (
          empreendimentos.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Todos os achados em aberto já estão atribuídos a este
                funcionário.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto rounded-md border bg-card">
              <ul>
                {empreendimentos.map((emp) => (
                  <li key={emp.id}>
                    <button
                      type="button"
                      onClick={() => escolherEmpreendimento(emp)}
                      className="group flex w-full items-center justify-between gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {emp.nome}
                        </p>
                        <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                          <span className="tabular-nums">
                            {String(emp.disponiveis).padStart(2, "0")}
                          </span>{" "}
                          {emp.disponiveis === 1
                            ? "achado disponível"
                            : "achados disponíveis"}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={voltarParaEmpreendimentos}
                disabled={savePending}
              >
                <ArrowLeft className="mr-1.5 size-4" />
                Voltar
              </Button>
              {atLimit ? (
                <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  Mostrando os primeiros 500. Use o filtro pra refinar.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por local, descrição ou unidade..."
                  className="pl-8"
                  disabled={loadingCandidatos}
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
                      disabled={loadingCandidatos}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors disabled:opacity-50",
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
              {loadingCandidatos ? (
                <div className="flex h-full items-center justify-center p-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : grupos.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                    {candidatos.length === 0
                      ? "Sem achados disponíveis"
                      : "Nenhum achado bate com o filtro"}
                  </p>
                </div>
              ) : (
                grupos.map((g) => {
                  const allSelected =
                    g.itens.length > 0 &&
                    g.itens.every((it) => selecionados.has(it.achadoId));
                  return (
                    <div
                      key={g.unidadeId}
                      className="border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2 border-b border-dashed border-border bg-muted/30 px-3 py-2">
                        <Checkbox
                          checked={allSelected}
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
                          const isChecked = selecionados.has(it.achadoId);
                          return (
                            <li
                              key={it.achadoId}
                              className="flex items-start gap-2 border-b border-border/50 px-3 py-2 last:border-b-0 hover:bg-muted/20"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleAchado(it.achadoId)}
                                aria-label={`Selecionar achado ${it.descricao}`}
                                className="mt-1"
                              />
                              <label
                                className="min-w-0 flex-1 cursor-pointer"
                                onClick={() => toggleAchado(it.achadoId)}
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
                  ? "selecionado"
                  : "selecionados"}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleOpenChange(false)}
                  disabled={savePending}
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  disabled={savePending || novosSelecionados.length === 0}
                  onClick={onSubmit}
                >
                  {savePending ? "Atribuindo..." : "Atribuir selecionados"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
