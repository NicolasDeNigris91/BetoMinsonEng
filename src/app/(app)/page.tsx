import Link from "next/link";
import { Building2, ClipboardList } from "lucide-react";
import { PrazoBadge } from "@/components/prazo-badge";
import { Button } from "@/components/ui/button";
import { CATEGORIA_LABELS } from "@/db/schema";
import { CATEGORIA_DOT } from "@/lib/category-styles";
import { formatDate } from "@/lib/format";
import { getDateFormat } from "@/lib/date-format-server";
import { cn } from "@/lib/utils";
import { getDashboardData } from "./dashboard-data";
import { DashboardAtividade } from "./dashboard-activity";
import { DashboardPrazoBanner } from "./dashboard-prazo-banner";

// force-dynamic intencional: a pagina passa por requireSession (cookie),
// que ja torna o request dinamico. Os dados pesados sao cacheados em
// getDashboardData via unstable_cache + revalidateTag — entao "dynamic
// page, cached data" e o pattern aqui.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const seteDiasAtrasISO = seteDiasAtras.toISOString().slice(0, 10);

  const dateFmt = await getDateFormat();

  const {
    totalAbertos,
    totalAtrasados,
    totalRascunhos,
    totalVistoriasSemana,
    totalEmp,
    totalUnid,
    totalSemPrazo,
    deltaAbertos,
    deltaVistorias,
    proximasPendencias,
    achadosSemPrazo,
    atividade,
    semana,
    proximaVistoria,
  } = await getDashboardData(seteDiasAtrasISO);

  // Sugestao de proxima acao — regra simples por prioridade:
  //   1. Atrasados > 0 (sempre o mais urgente)
  //   2. Rascunhos abertos (impede fechamento da operacao)
  //   3. Proxima vistoria agendada (informativo)
  //   4. Nada → omite o bloco
  const nextAction =
    totalAtrasados > 0
      ? {
          label: "Atrasados sem resolução",
          msg: `${totalAtrasados} ${totalAtrasados === 1 ? "achado atrasado" : "achados atrasados"} pendente${totalAtrasados === 1 ? "" : "s"}.`,
          linkLabel: "Ver atrasados →",
          href: "/empreendimentos?sort=atrasados",
        }
      : totalRascunhos > 0
        ? {
            label: "Rascunhos abertos",
            msg: `${totalRascunhos} ${totalRascunhos === 1 ? "vistoria em rascunho" : "vistorias em rascunho"} aguardando finalização.`,
            linkLabel: "Ver empreendimentos →",
            href: "/empreendimentos",
          }
        : proximaVistoria
          ? {
              label: "Próxima vistoria",
              msg: `${formatDate(proximaVistoria.dataISO, dateFmt)} — ${proximaVistoria.empreendimentoNome} · ${proximaVistoria.unidadeNome}`,
              linkLabel: null,
              href: null,
            }
          : null;

  const DIA_SEMANA_LABEL = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
          Painel
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
          <span>
            <span className="tabular-nums font-bold text-foreground">
              {String(totalEmp).padStart(2, "0")}
            </span>{" "}
            {totalEmp === 1 ? "empreendimento" : "empreendimentos"}
          </span>
          <span>
            <span className="tabular-nums font-bold text-foreground">
              {String(totalUnid).padStart(2, "0")}
            </span>{" "}
            {totalUnid === 1 ? "unidade" : "unidades"}
          </span>
        </div>
      </div>

      {/* Info-bar densa: 4 indicadores em linha horizontal com divider entre. */}
      <div className="grid grid-cols-2 divide-x divide-y rounded-lg border bg-card md:grid-cols-4 md:divide-y-0">
        <InfoCell
          label="Em aberto"
          value={totalAbertos}
          valueClass={totalAbertos > 0 ? "text-amber-700 dark:text-amber-300" : undefined}
          sub={
            deltaAbertos === 0
              ? "estável vs 7d ant."
              : deltaAbertos > 0
                ? `+${deltaAbertos} esta semana`
                : `${deltaAbertos} esta semana`
          }
        />
        <InfoCell
          label="Atrasados"
          value={totalAtrasados}
          valueClass={
            totalAtrasados > 0
              ? "text-destructive"
              : "text-emerald-700 dark:text-emerald-300"
          }
          sub={totalAtrasados > 0 ? "prazo vencido" : "nenhum vencido"}
          subClass={totalAtrasados > 0 ? "text-destructive" : undefined}
        />
        <InfoCell
          label="Rascunhos"
          value={totalRascunhos}
          valueClass={totalRascunhos > 0 ? "text-amber-700 dark:text-amber-300" : undefined}
          sub={
            totalRascunhos > 0 ? "aguardando finalizar" : "nenhum aberto"
          }
        />
        <InfoCell
          label="Vistorias 7d"
          value={totalVistoriasSemana}
          sub={
            deltaVistorias === 0
              ? "estável vs 7d ant."
              : deltaVistorias > 0
                ? `+${deltaVistorias} vs 7d ant.`
                : `${deltaVistorias} vs 7d ant.`
          }
          subClass={deltaVistorias > 0 ? "text-emerald-700 dark:text-emerald-300" : undefined}
        />
      </div>

      {/* Proxima acao sugerida — destaque com border-left brand. Omite quando
          nao ha nada urgente nem agenda. */}
      {nextAction ? (
        <div className="rounded-lg border border-l-4 border-l-brand bg-brand/[0.04] px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-brand">
            Próxima ação · {nextAction.label}
          </p>
          <p className="mt-1 text-sm">
            {nextAction.msg}
            {nextAction.href && nextAction.linkLabel ? (
              <>
                {" "}
                <Link
                  href={nextAction.href}
                  className="font-medium text-brand underline-offset-2 hover:underline"
                >
                  {nextAction.linkLabel}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {/* Agenda da semana — 7 celulas compactas com contagem de vistorias por dia. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Agenda da semana
          </h2>
          {proximaVistoria ? (
            <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
              próxima ·{" "}
              <span className="tabular-nums text-foreground">
                {formatDate(proximaVistoria.dataISO, dateFmt)}
              </span>{" "}
              · {proximaVistoria.empreendimentoNome} · {proximaVistoria.unidadeNome}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {semana.map((d, i) => (
            <div
              key={d.dataISO}
              className={cn(
                "rounded-md border bg-card p-2 text-center",
                d.isHoje && "border-brand bg-brand/5",
              )}
            >
              <p
                className={cn(
                  "font-mono text-[9px] tracking-[0.14em] uppercase",
                  d.isHoje ? "text-brand" : "text-muted-foreground",
                )}
              >
                {DIA_SEMANA_LABEL[i]}
              </p>
              <p
                className={cn(
                  "font-tech text-base",
                  d.isHoje && "font-bold text-brand",
                )}
              >
                {d.dataISO.slice(8, 10)}
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-[10px] tabular-nums",
                  d.n > 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground",
                )}
              >
                {d.n > 0 ? `${String(d.n).padStart(2, "0")} vist.` : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Grade de 7 colunas pra bater com a "Agenda da semana" acima.
          Pendencias span 4 (mais espaco pra descricao + prazo);
          atividade span 3. Divisoria cai no limite QUI/SEX, alinhada
          a uma borda de dia da semana em cima — nao mais no meio de
          uma coluna. */}
      <div className="grid gap-6 lg:grid-cols-7">
        <section className="space-y-3 lg:col-span-4">
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

        <section className="space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
              Atividade recente
            </h2>
            {atividade.length > 0 ? (
              <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
                últimos {atividade.length}
              </span>
            ) : null}
          </div>
          <DashboardAtividade items={atividade} />
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

      <DashboardPrazoBanner
        totalAbertos={totalAbertos}
        totalSemPrazo={totalSemPrazo}
        achadosSemPrazo={achadosSemPrazo}
      />
    </div>
  );
}

function InfoCell({
  label,
  value,
  valueClass,
  sub,
  subClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("font-tech text-2xl", valueClass)}>
          {String(value).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "font-mono text-[10px] text-muted-foreground",
            subClass,
          )}
        >
          {sub}
        </span>
      </div>
    </div>
  );
}
