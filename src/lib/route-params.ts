import "server-only";
import { notFound } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Valida que um segmento de rota e UUID antes de bater no DB. Postgres rejeita
 * casts invalidos com erro nao-tratavel ("invalid input syntax for type uuid"),
 * que sobe ate error.tsx mostrando "Algo deu errado" — confunde quem digitou
 * URL errada. Chamar isso na primeira linha da page redireciona pro not-found
 * sem tocar no banco. Como `notFound()` roda antes do streaming comecar (sem
 * await prévio), o status code volta certo (404) mesmo com loading.tsx no path.
 */
export function parseUuidOrNotFound(value: string): string {
  if (!isUuid(value)) notFound();
  return value;
}
