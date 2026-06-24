import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  MessageCircle,
  MessageSquare,
  Power,
  Users,
} from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { CATEGORIA_BADGE_CLASS } from "@/lib/category-styles";
import { type Categoria } from "@/db/schema";
import { cn } from "@/lib/utils";
import { FuncionarioFormDialog } from "./funcionario-form-dialog";
import { CaixaDeEntrada } from "./caixa-de-entrada";
import {
  fetchFuncionariosDashboard,
  type FuncionarioRich,
  type Saude,
} from "./dashboard-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Funcionários" };

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  const min = ms / 60000;
  if (min < 1) return "agora";
  if (min < 60) return `há ${Math.floor(min)}min`;
  const h = min / 60;
  if (h < 24) return `há ${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 30) return `há ${Math.floor(d)}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

const SAUDE_LABEL: Record<Saude, string> = {
  ok: "saudável",
  warn: "atenção",
  bad: "sem atividade",
};

const SAUDE_CLASS: Record<Saude, string> = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  bad: "bg-red-100 text-red-800 border-red-200",
};

const SAUDE_DOT: Record<Saude, string> = {
  ok: "🟢",
  warn: "🟡",
  bad: "🔴",
};

export default async function FuncionariosDashboardPage() {
  const data = await fetchFuncionariosDashboard();
  const {
    kpis,
    funcionarios,
    alertas,
    feed,
    empreendimentos: empStats,
    mixCategoria,
    heatmap,
  } = data;

  const delta7d = kpis.resolvidos7d - kpis.resolvidos7dPrev;
  const empsParaHeatmap = empStats.filter((e) => e.pendentes + e.resolvidos > 0);
  const funcsAtivos = funcionarios.filter((f) => f.ativo);
  const funcsDesativados = funcionarios.filter((f) => !f.ativo);

  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: "Funcionários" }]} />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            Funcionários internos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Painel de operação do time. Carga, vazão e sinais de bloqueio em
            tempo real.
          </p>
        </div>
        <FuncionarioFormDialog />
      </header>

      {/* Hero de mensagens novas (so quando ha algo nao lido) */}
      {kpis.mensagensNaoLidas > 0 ? (
        <section
          className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
          aria-live="polite"
        >
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageCircle className="size-3.5" />
          </span>
          <div className="flex-1">
            <p className="text-sm">
              <strong>
                {kpis.mensagensNaoLidas} mensagem
                {kpis.mensagensNaoLidas === 1 ? "" : "s"} nova
                {kpis.mensagensNaoLidas === 1 ? "" : "s"}
              </strong>{" "}
              {kpis.mensagensFuncionariosComNaoLidas > 1
                ? `de ${kpis.mensagensFuncionariosComNaoLidas} funcionários`
                : "do funcionário no campo"}
              .
            </p>
            {kpis.mensagemMaisAntigaNaoLidaEm ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                A mais antiga {relTime(kpis.mensagemMaisAntigaNaoLidaEm)}.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* KPIs */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          Visão geral
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard
            label="Em circulação"
            value={kpis.emCirculacao}
            hint="atribuídos e em aberto"
          />
          <KpiCard
            label="Resolvidos · 7d"
            value={kpis.resolvidos7d}
            hint={
              kpis.resolvidos7dPrev === 0
                ? "vs 7d anteriores"
                : `${delta7d >= 0 ? "↑" : "↓"} ${Math.abs(
                    Math.round((delta7d / Math.max(1, kpis.resolvidos7dPrev)) * 100),
                  )}% vs 7d anteriores`
            }
            hintColor={
              delta7d > 0
                ? "text-emerald-600"
                : delta7d < 0
                  ? "text-red-600"
                  : undefined
            }
          />
          <KpiCard
            label="Persistências abertas"
            value={kpis.persistenciasAbertas}
            valueColor={kpis.persistenciasAbertas > 0 ? "text-amber-700" : undefined}
            hint={
              kpis.persistenciasVelhas > 0
                ? `${kpis.persistenciasVelhas} há mais de 14 dias`
                : "nenhuma envelhecendo"
            }
          />
          <KpiCard
            label="Atrasados"
            value={kpis.atrasados}
            valueColor={kpis.atrasados > 0 ? "text-red-700" : undefined}
            hint="prazo vencido"
          />
          <KpiCard
            label="Funcionários ativos"
            value={kpis.funcionariosAtivos}
            valueSuffix={` / ${kpis.funcionariosTotal}`}
            hint={
              kpis.funcionariosTotal - kpis.funcionariosAtivos > 0
                ? `${kpis.funcionariosTotal - kpis.funcionariosAtivos} desativado(s)`
                : "time completo"
            }
          />
        </div>
      </section>

      {/* Alertas + Mix categoria */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-dashed bg-amber-50/60 px-4 py-2 dark:bg-amber-950/20">
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-amber-800 dark:text-amber-400">
              <AlertTriangle className="size-3" />
              Sinais que pedem atenção ·{" "}
              <span className="tabular-nums">
                {String(alertas.length).padStart(2, "0")}
              </span>
            </p>
          </header>
          {alertas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum alerta no momento. Bom trabalho.
            </div>
          ) : (
            <ul className="divide-y">
              {alertas.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "mt-1.5 inline-block size-2 shrink-0 rounded-full",
                      a.severidade === "alta" ? "bg-red-500" : "bg-amber-500",
                    )}
                  />
                  <div className="flex-1 text-sm">
                    <p>{a.mensagem}</p>
                    {a.detalhe ? (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                        &ldquo;{a.detalhe}&rdquo;
                      </p>
                    ) : null}
                  </div>
                  {a.href ? (
                    <Link
                      href={a.href}
                      className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
                    >
                      Ver
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            Mix técnico · em circulação
          </p>
          {mixCategoria.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {mixCategoria.map((c) => {
                const total = mixCategoria.reduce((s, x) => s + x.n, 0);
                const pct = total > 0 ? (c.n / total) * 100 : 0;
                return (
                  <div key={c.categoria}>
                    <div className="mb-0.5 flex items-center justify-between text-[12px]">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px]",
                          CATEGORIA_BADGE_CLASS[c.categoria],
                        )}
                      >
                        {c.categoria}
                      </Badge>
                      <span className="tabular-nums text-muted-foreground">
                        {c.n}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-foreground/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Caixa de entrada (so renderiza se ha threads) */}
      <CaixaDeEntrada funcionarios={funcionarios} />

      {/* Lista rica de funcionarios */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Time
          </h2>
          <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
            <span className="tabular-nums text-foreground">
              {String(funcsAtivos.length).padStart(2, "0")}
            </span>{" "}
            ativo{funcsAtivos.length === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums text-foreground">
              {String(kpis.emCirculacao).padStart(2, "0")}
            </span>{" "}
            em circulação
          </span>
        </div>

        {funcsAtivos.length === 0 && funcsDesativados.length === 0 ? (
          <EmptyTime />
        ) : (
          <div className="space-y-3">
            {funcsAtivos.map((f) => (
              <FuncionarioCard key={f.id} f={f} />
            ))}
            {funcsDesativados.map((f) => (
              <FuncionarioDesativado key={f.id} f={f} />
            ))}
          </div>
        )}
      </section>

      {/* Feed atividade + Por empreendimento */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card lg:col-span-2">
          <header className="border-b border-dashed bg-muted/30 px-4 py-2">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Atividade recente
            </p>
          </header>
          {feed.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sem atividade recente no time.
            </div>
          ) : (
            <ul className="divide-y">
              {feed.map((e) => (
                <FeedRow key={e.id} e={e} />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card">
          <header className="border-b border-dashed bg-muted/30 px-4 py-2">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Por empreendimento
            </p>
          </header>
          {empStats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum empreendimento.
            </div>
          ) : (
            <ul className="divide-y text-[12px]">
              {empStats.slice(0, 10).map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <Link
                    href={`/empreendimentos/${e.id}`}
                    className="block hover:underline"
                  >
                    <p className="font-semibold">{e.nome}</p>
                  </Link>
                  <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] tabular-nums text-muted-foreground">
                    <span className="text-foreground">
                      {String(e.pendentes).padStart(2, "0")}
                    </span>{" "}
                    pend ·{" "}
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {String(e.resolvidos).padStart(2, "0")}
                    </span>{" "}
                    res
                    {e.atrasados > 0 ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-red-700 dark:text-red-400">
                          {String(e.atrasados).padStart(2, "0")} atrasado
                          {e.atrasados === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {e.funcionariosAtuando.length > 0
                      ? e.funcionariosAtuando.join(" · ")
                      : "ninguém atribuído"}
                    {e.achadosOrfaos > 0 ? (
                      <span className="ml-1 text-amber-700 dark:text-amber-400">
                        ({e.achadosOrfaos} órfão{e.achadosOrfaos === 1 ? "" : "s"})
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Heatmap */}
      {empsParaHeatmap.length > 0 && funcsAtivos.length > 0 ? (
        <section className="rounded-lg border bg-card">
          <header className="flex items-baseline justify-between border-b border-dashed bg-muted/30 px-4 py-2">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Carga · funcionário × empreendimento
            </p>
            <p className="text-[10px] text-muted-foreground">
              em aberto
            </p>
          </header>
          <Heatmap
            funcionarios={funcsAtivos}
            empreendimentos={empsParaHeatmap}
            heatmap={heatmap}
          />
        </section>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueSuffix,
  valueColor,
  hint,
  hintColor,
}: {
  label: string;
  value: number;
  valueSuffix?: string;
  valueColor?: string;
  hint: string;
  hintColor?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-3xl font-extrabold tabular-nums",
          valueColor ?? "text-foreground",
        )}
      >
        {String(value).padStart(2, "0")}
        {valueSuffix ? (
          <span className="text-base font-medium text-muted-foreground">
            {valueSuffix}
          </span>
        ) : null}
      </p>
      <p
        className={cn(
          "mt-1 text-[11px]",
          hintColor ?? "text-muted-foreground",
        )}
      >
        {hint}
      </p>
    </div>
  );
}

function FuncionarioCard({ f }: { f: FuncionarioRich }) {
  const iniciais = f.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  const total = f.pendentes + f.persistencias + f.resolvidos;
  const pctPend = total > 0 ? (f.pendentes / total) * 100 : 0;
  const pctPersiste = total > 0 ? (f.persistencias / total) * 100 : 0;
  const pctResolvido = total > 0 ? (f.resolvidos / total) * 100 : 0;

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4",
        f.saude === "bad" && "ring-1 ring-red-200 dark:ring-red-900",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground font-bold text-background">
            {iniciais || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/funcionarios/${f.id}`}
                className="text-base font-semibold hover:underline"
              >
                {f.nome}
              </Link>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
                ativo
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em]",
                  SAUDE_CLASS[f.saude],
                )}
                title={SAUDE_LABEL[f.saude]}
              >
                {SAUDE_DOT[f.saude]} {SAUDE_LABEL[f.saude]}
              </span>
              {f.mensagensNaoLidas > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
                  <MessageCircle className="size-3" />
                  {f.mensagensNaoLidas} nova
                  {f.mensagensNaoLidas === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {f.empreendimentos.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
                  Empreendimentos:
                </span>
                {f.empreendimentos.slice(0, 4).map((e) => (
                  <span
                    key={e.id}
                    className="rounded-md border bg-muted/40 px-1.5 py-0.5"
                  >
                    {e.nome}
                  </span>
                ))}
                {f.empreendimentos.length > 4 ? (
                  <span className="text-[10px] text-muted-foreground">
                    +{f.empreendimentos.length - 4}
                  </span>
                ) : null}
              </div>
            ) : null}
            {f.categorias.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {f.categorias.map((c) => (
                  <span
                    key={c.categoria}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px]",
                      CATEGORIA_BADGE_CLASS[c.categoria],
                    )}
                  >
                    {c.categoria} · {c.n}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-3 text-center sm:w-72">
          <Metric label="Pendentes" value={f.pendentes} />
          <Metric
            label="Persiste"
            value={f.persistencias}
            color={f.persistencias > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
          />
          <Metric
            label="Resolvidos"
            value={f.resolvidos}
            color={
              f.resolvidos > 0 ? "text-emerald-700 dark:text-emerald-400" : undefined
            }
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {pctPend > 0 ? (
            <div className="h-full bg-foreground" style={{ width: `${pctPend}%` }} />
          ) : null}
          {pctPersiste > 0 ? (
            <div
              className="h-full bg-amber-500"
              style={{ width: `${pctPersiste}%` }}
            />
          ) : null}
          {pctResolvido > 0 ? (
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${pctResolvido}%` }}
            />
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            Taxa:{" "}
            <strong className="text-foreground tabular-nums">
              {f.taxaResolucao !== null
                ? `${Math.round(f.taxaResolucao * 100)}%`
                : "—"}
            </strong>
            {f.tempoMedioDias !== null ? (
              <>
                {" · "}Tempo médio:{" "}
                <strong className="text-foreground tabular-nums">
                  {f.tempoMedioDias.toFixed(1)}d
                </strong>
              </>
            ) : null}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            Última ação <strong>{relTime(f.ultimaAcaoEm)}</strong>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed pt-3">
        <Link
          href={`/funcionarios/${f.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-[12px] hover:bg-muted"
        >
          Ver detalhe
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </article>
  );
}

function FuncionarioDesativado({ f }: { f: FuncionarioRich }) {
  return (
    <article className="rounded-lg border bg-muted/30 p-4 opacity-70">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted-foreground/40 font-bold text-background">
          <Power className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/funcionarios/${f.id}`}
              className="text-base font-semibold hover:underline"
            >
              {f.nome}
            </Link>
            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em] text-red-700 dark:bg-red-950/40 dark:text-red-400">
              desativado
            </span>
            {f.desativadoEm ? (
              <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
                em{" "}
                {new Date(f.desativadoEm).toLocaleDateString("pt-BR")}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Histórico:{" "}
            <span className="tabular-nums">{f.resolvidos}</span> resolvidos ·{" "}
            <span className="tabular-nums">{f.pendentes}</span> pendentes
          </p>
        </div>
        <Link
          href={`/funcionarios/${f.id}`}
          className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted"
        >
          Ver
        </Link>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-extrabold tabular-nums",
          color ?? "text-foreground",
        )}
      >
        {String(value).padStart(2, "0")}
      </p>
    </div>
  );
}

function FeedRow({
  e,
}: {
  e: {
    tipo: "resolvido" | "persiste" | "nota" | "criado";
    funcionarioNome: string;
    achadoLocal: string | null;
    achadoDescricao: string;
    categoria: Categoria;
    empreendimentoId: string;
    empreendimentoNome: string;
    unidadeId: string;
    unidadeNome: string;
    fotosCount: number;
    notaExtra: string | null;
    createdAt: string;
  };
}) {
  const iconBg =
    e.tipo === "resolvido"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      : e.tipo === "persiste"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  const acao =
    e.tipo === "resolvido"
      ? "resolveu"
      : e.tipo === "persiste"
        ? "persistiu"
        : e.tipo === "nota"
          ? "anotou"
          : "registrou";

  const local = e.achadoLocal ?? e.achadoDescricao.slice(0, 60);
  const href = `/empreendimentos/${e.empreendimentoId}/unidades/${e.unidadeId}/historico`;

  return (
    <li>
    <Link
      href={href}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
          iconBg,
        )}
      >
        {e.tipo === "resolvido" ? (
          <CheckCircle2 className="size-3" />
        ) : e.tipo === "persiste" ? (
          <MessageSquare className="size-3" />
        ) : (
          "·"
        )}
      </span>
      <div className="flex-1 text-sm">
        <p>
          <strong>{e.funcionarioNome}</strong> {acao}{" "}
          <Badge
            variant="outline"
            className={cn(
              "ml-0.5 font-mono text-[10px]",
              CATEGORIA_BADGE_CLASS[e.categoria],
            )}
          >
            {e.categoria}
          </Badge>{" "}
          <strong>{local}</strong>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {e.empreendimentoNome} · {e.unidadeNome}
          {e.fotosCount > 0 ? (
            <>
              {" · "}
              <Camera className="inline-block size-3 mr-0.5" />
              {e.fotosCount} foto{e.fotosCount === 1 ? "" : "s"}
            </>
          ) : null}
          {" · "}
          {relTime(e.createdAt)}
        </p>
        {e.notaExtra ? (
          <p className="mt-1 border-l-2 pl-2 text-[11px] italic text-muted-foreground">
            &ldquo;{e.notaExtra}&rdquo;
          </p>
        ) : null}
      </div>
    </Link>
    </li>
  );
}

function Heatmap({
  funcionarios,
  empreendimentos,
  heatmap,
}: {
  funcionarios: FuncionarioRich[];
  empreendimentos: { id: string; nome: string }[];
  heatmap: { funcionarioId: string; empreendimentoId: string; count: number }[];
}) {
  const cellMap = new Map<string, number>();
  for (const h of heatmap) {
    cellMap.set(`${h.funcionarioId}|${h.empreendimentoId}`, h.count);
  }

  const cellColor = (n: number): string => {
    if (n === 0) return "bg-muted/40 text-muted-foreground/50";
    if (n <= 2) return "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
    if (n <= 4) return "bg-orange-200 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100";
    if (n <= 6) return "bg-orange-300 text-orange-900";
    if (n <= 9) return "bg-orange-400 text-white";
    return "bg-orange-600 text-white";
  };

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[480px] text-[11px]">
        <thead>
          <tr className="font-mono uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 text-left font-normal"></th>
            {empreendimentos.map((e) => (
              <th
                key={e.id}
                className="truncate px-1 font-normal"
                title={e.nome}
              >
                {e.nome.length > 14 ? e.nome.slice(0, 12) + "…" : e.nome}
              </th>
            ))}
            <th className="px-2 text-center font-normal text-foreground/80">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {funcionarios.map((f) => {
            const totalLinha = empreendimentos.reduce(
              (s, e) => s + (cellMap.get(`${f.id}|${e.id}`) ?? 0),
              0,
            );
            return (
              <tr key={f.id}>
                <td className="py-1 pr-3 font-medium">{f.nome}</td>
                {empreendimentos.map((e) => {
                  const n = cellMap.get(`${f.id}|${e.id}`) ?? 0;
                  return (
                    <td key={e.id} className="px-1 py-0.5">
                      <div
                        className={cn(
                          "flex aspect-square w-full items-center justify-center rounded font-mono text-[11px] tabular-nums",
                          cellColor(n),
                        )}
                      >
                        {n === 0 ? "—" : String(n).padStart(2, "0")}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 text-center font-semibold tabular-nums">
                  {String(totalLinha).padStart(2, "0")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTime() {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center">
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
          <Users className="size-6 text-muted-foreground/60" aria-hidden />
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          Sem funcionários ainda
        </p>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Cadastre o primeiro pra gerar o link de trabalho dele.
        </p>
        <FuncionarioFormDialog />
      </div>
    </div>
  );
}
