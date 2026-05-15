"use client";

import { useState } from "react";
import { Calendar, FileText, TrendingUp } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Props = {
  empreendimentoId: string;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoStartOfTrimestreAtual(): string {
  const now = new Date();
  const month = now.getMonth(); // 0..11
  const trimestreStartMonth = Math.floor(month / 3) * 3;
  return new Date(now.getFullYear(), trimestreStartMonth, 1)
    .toISOString()
    .slice(0, 10);
}

function isoUltimoTrimestre(): { inicio: string; fim: string } {
  const now = new Date();
  const month = now.getMonth();
  const inicioMes = Math.floor(month / 3) * 3 - 3;
  const inicioAno = inicioMes < 0 ? now.getFullYear() - 1 : now.getFullYear();
  const adjInicioMes = ((inicioMes % 12) + 12) % 12;
  const inicio = new Date(inicioAno, adjInicioMes, 1);
  const fim = new Date(inicioAno, adjInicioMes + 3, 0); // ultimo dia
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

type Preset = {
  label: string;
  build: () => { inicio: string; fim: string };
};

const PRESETS: Preset[] = [
  {
    label: "Últimos 30 dias",
    build: () => ({ inicio: isoDaysAgo(30), fim: isoToday() }),
  },
  {
    label: "Últimos 90 dias",
    build: () => ({ inicio: isoDaysAgo(90), fim: isoToday() }),
  },
  {
    label: "Trimestre atual",
    build: () => ({ inicio: isoStartOfTrimestreAtual(), fim: isoToday() }),
  },
  { label: "Último trimestre", build: isoUltimoTrimestre },
];

/**
 * Dialog que coleta o periodo (inicio/fim) e abre o PDF de evolucao numa
 * nova aba. Inclui presets pros casos comuns (mes/trimestre).
 */
export function RelatorioEvolucaoDialog({ empreendimentoId }: Props) {
  const [open, setOpen] = useState(false);
  const [inicio, setInicio] = useState<string>(() => isoDaysAgo(30));
  const [fim, setFim] = useState<string>(() => isoToday());
  const [activePreset, setActivePreset] = useState<string | null>("Últimos 30 dias");

  const applyPreset = (preset: Preset) => {
    const { inicio: i, fim: f } = preset.build();
    setInicio(i);
    setFim(f);
    setActivePreset(preset.label);
  };

  const valido = inicio && fim && inicio <= fim;

  const href = valido
    ? `/api/pdf/evolucao/${empreendimentoId}?inicio=${inicio}&fim=${fim}`
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <TrendingUp className="mr-1.5 size-4" />
            Relatório de evolução
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relatório de evolução</DialogTitle>
          <DialogDescription>
            Compara o que foi resolvido no período com o que continua em
            aberto. Cada achado resolvido aparece com foto antes e depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Períodos comuns</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
                    activePreset === p.label
                      ? "border-brand bg-brand/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <Calendar className="size-3" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inicio">De</Label>
              <Input
                id="inicio"
                type="date"
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value);
                  setActivePreset(null);
                }}
                max={fim || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fim">Até</Label>
              <Input
                id="fim"
                type="date"
                value={fim}
                onChange={(e) => {
                  setFim(e.target.value);
                  setActivePreset(null);
                }}
                min={inicio || undefined}
                max={isoToday()}
              />
            </div>
          </div>

          {!valido ? (
            <p className="text-xs text-destructive">
              A data de início precisa ser anterior ou igual à data de fim.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!href}
            render={
              href ? <a href={href} target="_blank" rel="noreferrer" /> : undefined
            }
            onClick={() => setOpen(false)}
          >
            <FileText className="mr-1.5 size-4" />
            Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
