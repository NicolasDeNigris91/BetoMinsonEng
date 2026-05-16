import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export type DateFormat = "br" | "iso";

/** Nome do cookie que guarda a preferencia do usuario. */
export const DATE_FORMAT_COOKIE = "diminson_date_format";

export function formatDate(
  value: Date | string,
  fmt: DateFormat = "br",
): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return fmt === "iso"
    ? format(date, "yyyy-MM-dd")
    : format(date, "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTime(
  value: Date | string,
  fmt: DateFormat = "br",
): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return fmt === "iso"
    ? format(date, "yyyy-MM-dd HH:mm")
    : format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/**
 * Wrappers que forcam BR — usados em PDFs e laudos publicos que precisam
 * ser estaveis independente da preferencia do usuario que clicou em
 * "exportar".
 */
export function formatDateBR(value: Date | string): string {
  return formatDate(value, "br");
}

export function formatDateTimeBR(value: Date | string): string {
  return formatDateTime(value, "br");
}

export function formatTimeBR(value: Date | string): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "HH:mm", { locale: ptBR });
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export type PrazoState =
  | { kind: "atrasado"; dias: number; texto: string }
  | { kind: "hoje"; texto: string }
  | { kind: "proximo"; dias: number; texto: string }
  | { kind: "futuro"; dias: number; texto: string };

/**
 * Avalia o prazo de um achado (data ISO) contra hoje. Retorna null se nao
 * houver prazo. "Hoje" e tratado a parte do "proximo" pra dar destaque
 * (vence hoje vs vence em N dias).
 */
export function evaluatePrazo(prazoISO: string | null | undefined): PrazoState | null {
  if (!prazoISO) return null;
  const prazo = parseISO(prazoISO);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = differenceInCalendarDays(prazo, hoje);
  if (diff < 0) {
    const dias = Math.abs(diff);
    return {
      kind: "atrasado",
      dias,
      texto: dias === 1 ? "atrasado há 1 dia" : `atrasado há ${dias} dias`,
    };
  }
  if (diff === 0) {
    return { kind: "hoje", texto: "vence hoje" };
  }
  if (diff <= 7) {
    return {
      kind: "proximo",
      dias: diff,
      texto: diff === 1 ? "vence amanhã" : `vence em ${diff} dias`,
    };
  }
  return {
    kind: "futuro",
    dias: diff,
    texto: `prazo ${format(prazo, "dd/MM", { locale: ptBR })}`,
  };
}
