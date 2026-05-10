import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatDateBR(value: Date | string): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTimeBR(value: Date | string): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
