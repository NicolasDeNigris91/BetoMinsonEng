"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AchadoCard, type AchadoCardData } from "./achado-card";

export type UnidadeGroup = {
  unidadeId: string;
  unidadeNome: string;
  itens: AchadoCardData[];
};

export type EmpreendimentoGroup = {
  empreendimentoId: string;
  empreendimentoNome: string;
  unidades: UnidadeGroup[];
  totalAchados: number;
  totalPendentes: number;
  totalResolvidos: number;
};

type Props = {
  token: string;
  grupos: EmpreendimentoGroup[];
};

type Tab = "pendentes" | "resolvidos";

function isResolvido(it: AchadoCardData): boolean {
  return it.resolvidoEmOutro || it.evento?.tipo === "resolvido";
}

export function EmpreendimentoTabs({ token, grupos }: Props) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const selecionado =
    selecionadoId !== null
      ? grupos.find((g) => g.empreendimentoId === selecionadoId) ?? null
      : null;

  if (!selecionado) {
    return (
      <div className="space-y-3">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          <MapPin className="inline-block size-3 mr-1" />
          Onde você está?
        </p>
        <ul className="space-y-2">
          {grupos.map((g) => (
            <li key={g.empreendimentoId}>
              <button
                type="button"
                onClick={() => setSelecionadoId(g.empreendimentoId)}
                className="group flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-4 text-left transition-all hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-base font-bold tracking-tight">
                    {g.empreendimentoNome}
                  </h2>
                  <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                    <span
                      className={cn(
                        "tabular-nums",
                        g.totalPendentes > 0
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {String(g.totalPendentes).padStart(2, "0")}
                    </span>{" "}
                    pendente{g.totalPendentes === 1 ? "" : "s"} ·{" "}
                    <span className="tabular-nums text-foreground">
                      {String(g.totalAchados).padStart(2, "0")}
                    </span>{" "}
                    total
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <EmpreendimentoDetail
      key={selecionado.empreendimentoId}
      token={token}
      grupo={selecionado}
      onVoltar={() => setSelecionadoId(null)}
    />
  );
}

function EmpreendimentoDetail({
  token,
  grupo,
  onVoltar,
}: {
  token: string;
  grupo: EmpreendimentoGroup;
  onVoltar: () => void;
}) {
  const [tab, setTab] = useState<Tab>("pendentes");

  const unidadesVisiveis = useMemo(() => {
    return grupo.unidades
      .map((u) => ({
        ...u,
        itens: u.itens.filter((it) =>
          tab === "pendentes" ? !isResolvido(it) : isResolvido(it),
        ),
      }))
      .filter((u) => u.itens.length > 0);
  }, [grupo.unidades, tab]);

  const pendentesCount = grupo.totalPendentes;
  const resolvidosCount = grupo.totalResolvidos;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onVoltar}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <ArrowLeft className="size-3" />
            Voltar
          </button>
          <h2 className="mt-1 text-[18px] font-extrabold leading-tight tracking-[-0.015em]">
            {grupo.empreendimentoNome}
          </h2>
          <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
            <span
              className={cn(
                "tabular-nums",
                pendentesCount > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {String(pendentesCount).padStart(2, "0")}
            </span>{" "}
            pendente{pendentesCount === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums text-foreground">
              {String(resolvidosCount).padStart(2, "0")}
            </span>{" "}
            resolvido{resolvidosCount === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums text-foreground">
              {String(grupo.totalAchados).padStart(2, "0")}
            </span>{" "}
            total
          </p>
        </div>
        {pendentesCount > 0 ? (
          <a
            href={`/api/pdf/funcionario/${token}?empreendimento=${grupo.empreendimentoId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] tracking-[0.06em] uppercase text-foreground transition hover:bg-muted"
          >
            <FileText className="size-3.5" aria-hidden />
            Baixar checklist
          </a>
        ) : null}
      </div>

      <div role="tablist" className="flex gap-1.5">
        <TabButton
          ativo={tab === "pendentes"}
          onClick={() => setTab("pendentes")}
          label="Pendentes"
          count={pendentesCount}
        />
        <TabButton
          ativo={tab === "resolvidos"}
          onClick={() => setTab("resolvidos")}
          label="Resolvidos"
          count={resolvidosCount}
        />
      </div>

      {unidadesVisiveis.length === 0 ? (
        <div className="rounded-lg border bg-background p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {tab === "pendentes"
              ? "Tudo em dia neste empreendimento."
              : "Nada resolvido ainda."}
          </p>
        </div>
      ) : (
        unidadesVisiveis.map((u) => (
          <section key={u.unidadeId} className="space-y-2">
            <p className="px-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              {u.unidadeNome} ·{" "}
              <span className="tabular-nums">
                {String(u.itens.length).padStart(2, "0")}
              </span>{" "}
              achado{u.itens.length === 1 ? "" : "s"}
            </p>
            <ul className={tab === "resolvidos" ? "space-y-1.5" : "space-y-3"}>
              {u.itens.map((it) => (
                <li key={it.achadoId}>
                  <AchadoCard
                    token={token}
                    data={it}
                    mode={tab === "resolvidos" ? "compact" : "full"}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function TabButton({
  ativo,
  onClick,
  label,
  count,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
        ativo
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {label === "Resolvidos" && ativo ? (
        <CheckCircle2 className="size-3" />
      ) : null}
      {label}
      <span
        className={cn(
          "tabular-nums",
          ativo ? "opacity-90" : "opacity-70",
        )}
      >
        · {String(count).padStart(2, "0")}
      </span>
    </button>
  );
}
