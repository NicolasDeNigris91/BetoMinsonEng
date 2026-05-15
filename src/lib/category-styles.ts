import type {
  Categoria,
  EventoTipo,
  VistoriaStatus,
} from "@/db/schema";

/**
 * Classes Tailwind pra badge de categoria. Variant 'outline' do Badge da
 * estrutura (padding/font/radius), aqui sobrescrevemos cor de fundo,
 * texto e borda. Tons pastel pra nao virar carnaval, com variante dark.
 */
export const CATEGORIA_BADGE_CLASS: Record<Categoria, string> = {
  ELE: "border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
  HID: "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  HVAC: "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  PISCINA:
    "border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-200",
  ASP: "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200",
  SIS: "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200",
};

/** Faixa colorida lateral nos cards de achado (item 4 da estilizacao). */
export const CATEGORIA_STRIPE_BORDER: Record<Categoria, string> = {
  ELE: "border-l-yellow-400 dark:border-l-yellow-500",
  HID: "border-l-blue-500 dark:border-l-blue-400",
  HVAC: "border-l-sky-500 dark:border-l-sky-400",
  PISCINA: "border-l-teal-500 dark:border-l-teal-400",
  ASP: "border-l-violet-500 dark:border-l-violet-400",
  SIS: "border-l-slate-500 dark:border-l-slate-400",
};

/** Bolinha colorida solida — usada no select de categorias e badges com dot. */
export const CATEGORIA_DOT: Record<Categoria, string> = {
  ELE: "bg-yellow-400 dark:bg-yellow-500",
  HID: "bg-blue-500 dark:bg-blue-400",
  HVAC: "bg-sky-500 dark:bg-sky-400",
  PISCINA: "bg-teal-500 dark:bg-teal-400",
  ASP: "bg-violet-500 dark:bg-violet-400",
  SIS: "bg-slate-500 dark:bg-slate-400",
};

type StyledBadge = { className: string; label: string };

/**
 * Badges dos estados do evento por vistoria.
 * 'criado' nao tem badge (eh contextual — eh um achado novo, ja se entende).
 */
export const EVENTO_BADGE: Record<EventoTipo, StyledBadge | null> = {
  criado: null,
  persiste: {
    className:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    label: "Persiste",
  },
  resolvido: {
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
    label: "Resolvido",
  },
  nota: {
    className:
      "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
    label: "Anotação",
  },
};

/** Badge do status da vistoria (Rascunho vs Finalizada). */
export const VISTORIA_STATUS_BADGE: Record<VistoriaStatus, StyledBadge> = {
  rascunho: {
    className:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    label: "Rascunho",
  },
  finalizada: {
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
    label: "Finalizada",
  },
};

/** Faixa lateral 3px nos cards de vistoria (item 4 da identidade visual). */
export const VISTORIA_STATUS_STRIPE: Record<VistoriaStatus, string> = {
  rascunho: "bg-amber-500 dark:bg-amber-400",
  finalizada: "bg-emerald-500 dark:bg-emerald-400",
};

/** Status semantico para cards de empreendimento/unidade, derivado da
 *  atividade de achados em aberto. Alimenta a faixa lateral colorida. */
export type ActivityStatus = "success" | "warning" | "destructive" | "neutral";

export const ACTIVITY_STRIPE: Record<ActivityStatus, string> = {
  success: "bg-emerald-500 dark:bg-emerald-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  destructive: "bg-red-500 dark:bg-red-400",
  neutral: "bg-muted-foreground/30",
};

/** Decide o status do card a partir de # de achados abertos. Sem vistorias
 *  ainda = neutral (cinza); 0 abertos = success; >= destructiveThreshold
 *  = destructive; caso contrario warning. */
export function activityStatus(
  abertos: number,
  hasVistorias: boolean,
  destructiveThreshold: number,
): ActivityStatus {
  if (!hasVistorias) return "neutral";
  if (abertos === 0) return "success";
  if (abertos >= destructiveThreshold) return "destructive";
  return "warning";
}
