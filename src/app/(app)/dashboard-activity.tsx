import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ImageIcon,
  PlusCircle,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORIA_LABELS,
  type Categoria,
  type EventoTipo,
} from "@/db/schema";
import { type DashboardActivity } from "./dashboard-data";
import { cn } from "@/lib/utils";

type Props = {
  items: DashboardActivity[];
};

// Tag inline da categoria — versao compacta dos badges do app.
const CAT_TAG: Record<Categoria, string> = {
  ELE: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200",
  HID: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
  HVAC: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
  PISCINA:
    "bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200",
  ASP: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
  SIS: "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-200",
};

const EVENTO_ICON: Record<EventoTipo, LucideIcon> = {
  criado: PlusCircle,
  resolvido: CheckCircle2,
  persiste: PlusCircle,
  nota: PlusCircle,
};

const EVENTO_ICON_BG: Record<EventoTipo, string> = {
  criado: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  resolvido:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  persiste: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  nota: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const EVENTO_VERBO: Record<EventoTipo, string> = {
  criado: "Achado criado",
  resolvido: "Achado resolvido",
  persiste: "Achado mantido (persiste)",
  nota: "Anotação no achado",
};

export function DashboardAtividade({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-center text-muted-foreground">
        Sem atividade ainda. Crie uma vistoria pra começar.
      </div>
    );
  }

  // Altura fixa com scroll interno: preserva o panorama (banners, agenda,
  // ordens) na primeira dobra. Mascara de fade no rodape sinaliza que ha
  // mais conteudo abaixo. ~6 itens visiveis em 380px.
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <ul className="dashboard-scroll divide-y divide-dashed divide-border/70 max-h-[380px] overflow-y-auto">
        {items.map((item, i) => (
          <li key={i}>
            <ActivityRow item={item} />
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-b from-card/0 to-card"
      />
    </div>
  );
}

function ActivityRow({ item }: { item: DashboardActivity }) {
  if (item.kind === "vistoria-criada") {
    return (
      <Link
        href={`/empreendimentos/${item.empreendimentoId}/unidades/${item.unidadeId}/vistorias/${item.vistoriaId}`}
        className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40"
      >
        <IconBubble
          icon={ClipboardList}
          className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm text-foreground/85 leading-tight">
            Nova vistoria iniciada em{" "}
            <strong className="font-semibold text-foreground">
              {item.unidadeNome}
            </strong>
          </p>
          <p className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground/70">
            {item.empreendimentoNome} · {relativeTime(item.at)}
            {item.vistoriadorNome ? ` · ${item.vistoriadorNome}` : ""}
          </p>
        </div>
      </Link>
    );
  }

  if (item.kind === "vistoria-finalizada") {
    return (
      <Link
        href={`/empreendimentos/${item.empreendimentoId}/unidades/${item.unidadeId}/vistorias/${item.vistoriaId}`}
        className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40"
      >
        <IconBubble
          icon={ClipboardCheck}
          className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm text-foreground/85 leading-tight">
            Vistoria finalizada em{" "}
            <strong className="font-semibold text-foreground">
              {item.unidadeNome}
            </strong>
          </p>
          <p className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground/70">
            {item.empreendimentoNome} · {relativeTime(item.at)}
          </p>
        </div>
      </Link>
    );
  }

  // evento de achado
  const Icon = item.tipo === "resolvido" ? CheckCircle2 : EVENTO_ICON[item.tipo];
  const iconCls = EVENTO_ICON_BG[item.tipo];
  const verbo = EVENTO_VERBO[item.tipo];
  const viaFuncionario = Boolean(item.funcionarioOrigemId);

  return (
    <Link
      href={
        viaFuncionario
          ? `/funcionarios/${item.funcionarioOrigemId}`
          : `/empreendimentos/${item.empreendimentoId}/unidades/${item.unidadeId}`
      }
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40",
        viaFuncionario && "border-l-2 border-l-sky-500 bg-sky-500/[0.04]",
      )}
    >
      <IconBubble icon={Icon} className={iconCls} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm leading-tight">
          <span
            className={cn(
              "mr-1.5 inline-block rounded-sm px-1 py-0.5 font-mono text-[9px] tracking-[0.06em] uppercase font-semibold align-middle",
              CAT_TAG[item.categoria],
            )}
          >
            {CATEGORIA_LABELS[item.categoria]}
          </span>
          <span className="text-foreground/85">{verbo}</span>
          {item.local ? (
            <>
              {" "}
              em{" "}
              <strong className="font-semibold text-foreground">
                {item.local}
              </strong>
            </>
          ) : (
            <>
              {" "}
              em{" "}
              <strong className="font-semibold text-foreground">
                {item.unidadeNome}
              </strong>
            </>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] tracking-[0.04em] text-muted-foreground/70">
          <span>
            {item.empreendimentoNome}
            {item.local ? ` · ${item.unidadeNome}` : ""}
          </span>
          <span>·</span>
          <span>{relativeTime(item.at)}</span>
          {item.tipo === "resolvido" && item.diasAteResolver != null ? (
            <>
              <span>·</span>
              <span>
                {item.diasAteResolver} {item.diasAteResolver === 1 ? "dia" : "dias"} até resolver
              </span>
            </>
          ) : null}
          {item.tipo === "criado" && item.fotosCount > 0 ? (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="size-3" aria-hidden />
                {item.fotosCount} {item.fotosCount === 1 ? "foto" : "fotos"}
              </span>
            </>
          ) : null}
          {viaFuncionario && item.funcionarioOrigemNome ? (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                <UserCircle2 className="size-3" aria-hidden />
                via funcionário: {item.funcionarioOrigemNome}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

function IconBubble({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
        className,
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/**
 * Formata uma data ISO como tempo relativo curto: "agora", "há 5min",
 * "há 2h", "ontem", "há 3d", "há 2 sem", "há N meses". Recebe string
 * porque o feed passa por unstable_cache (que serializa Date pra string).
 */
function relativeTime(dateISO: string): string {
  const t = Date.parse(dateISO);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `há ${w} sem`;
  const m = Math.floor(d / 30);
  return `há ${m} ${m === 1 ? "mês" : "meses"}`;
}
