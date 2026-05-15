import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ClipboardList,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { PrazoBadge } from "@/components/prazo-badge";
import { Button } from "@/components/ui/button";
import { CATEGORIA_LABELS } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { cn } from "@/lib/utils";
import { getDashboardData } from "./dashboard-data";

// force-dynamic intencional: a pagina passa por requireSession (cookie),
// que ja torna o request dinamico. Os dados pesados sao cacheados em
// getDashboardData via unstable_cache + revalidateTag — entao "dynamic
// page, cached data" e o pattern aqui.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const seteDiasAtrasISO = seteDiasAtras.toISOString().slice(0, 10);

  const {
    totalAbertos,
    totalAtrasados,
    totalRascunhos,
    totalVistoriasSemana,
    totalEmp,
    totalUnid,
    deltaAbertos,
    deltaVistorias,
    proximasPendencias,
  } = await getDashboardData(seteDiasAtrasISO);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            Painel
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Visão geral das vistorias e pendências em aberto.</span>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground/70 border-l border-border pl-2">
              {String(totalEmp).padStart(2, "0")} emp ·{" "}
              {String(totalUnid).padStart(2, "0")} un
            </span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/empreendimentos" />}
        >
          <Building2 className="mr-1.5 size-4" />
          Empreendimentos
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Em aberto"
          value={totalAbertos}
          tone="accent"
          delta={deltaAbertos}
          sublabel={
            deltaAbertos === 0
              ? "estável vs semana ant."
              : deltaAbertos > 0
                ? `+${deltaAbertos} esta semana`
                : `${deltaAbertos} esta semana`
          }
        />
        <StatCard
          label="Atrasados"
          value={totalAtrasados}
          tone={totalAtrasados > 0 ? "danger" : "success"}
          sublabel={
            totalAtrasados > 0 ? "com prazo vencido" : "nenhum prazo vencido"
          }
        />
        <StatCard
          label="Rascunhos"
          value={totalRascunhos}
          tone={totalRascunhos > 0 ? "warning" : "default"}
          sublabel={
            totalRascunhos > 0
              ? "vistorias não-finalizadas"
              : "nenhum rascunho aberto"
          }
        />
        <StatCard
          label="Vistorias 7 dias"
          value={totalVistoriasSemana}
          delta={deltaVistorias}
          positiveIsGood
          sublabel="vs 7 dias anteriores"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
              Próximas pendências
            </h2>
            {proximasPendencias.length > 0 ? (
              <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
                ordenadas por prazo
              </span>
            ) : null}
          </div>

          {proximasPendencias.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
              {totalAbertos === 0
                ? "Nenhum achado em aberto. Bom trabalho."
                : "Nenhum achado em aberto com prazo definido. Defina prazos nos achados pra priorizar."}
            </div>
          ) : (
            <ul className="space-y-2">
              {proximasPendencias.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/empreendimentos/${p.empreendimentoId}/unidades/${p.unidadeId}`}
                    className="block rounded-md border bg-card p-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block size-2 shrink-0 rounded-full",
                          CATEGORIA_DOT[p.categoria],
                        )}
                      />
                      <span className="text-sm font-medium">
                        {CATEGORIA_LABELS[p.categoria]}
                      </span>
                      {p.local ? (
                        <span className="text-sm text-foreground/80">
                          — {p.local}
                        </span>
                      ) : null}
                      <PrazoBadge prazoEm={p.prazoEm} className="ml-auto" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {p.descricao}
                    </p>
                    <p className="mt-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground/70">
                      {p.empreendimentoNome} · {p.unidadeNome}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
              Atividade recente
            </h2>
          </div>
          <div className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
            Feed de atividade em breve.
          </div>
        </section>
      </div>

      {totalEmp === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
          <ClipboardList
            className="mx-auto size-9 text-muted-foreground/60"
            aria-hidden
          />
          <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
            Comece por aqui
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre seu primeiro empreendimento pra começar a registrar
            vistorias.
          </p>
          <Button className="mt-4" render={<Link href="/empreendimentos" />}>
            <Building2 className="mr-1.5 size-4" />
            Ir para empreendimentos
          </Button>
        </div>
      ) : null}

      {totalAbertos > 0 && proximasPendencias.length === 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden
          />
          <p className="text-amber-900 dark:text-amber-200">
            Existem <strong>{totalAbertos}</strong>{" "}
            {totalAbertos === 1 ? "achado em aberto" : "achados em aberto"} sem
            prazo definido. Defina prazos pra priorizar o que cobrar primeiro.
          </p>
        </div>
      ) : null}
    </div>
  );
}
