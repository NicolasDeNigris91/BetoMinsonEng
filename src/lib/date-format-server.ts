import "server-only";
import { cookies } from "next/headers";
import { DATE_FORMAT_COOKIE, type DateFormat } from "./format";

/**
 * Le o formato preferido do usuario a partir do cookie. Default: BR
 * quando o cookie nao existe (primeiro acesso). Server-only — client
 * components devem receber o valor por prop.
 */
export async function getDateFormat(): Promise<DateFormat> {
  const store = await cookies();
  return store.get(DATE_FORMAT_COOKIE)?.value === "iso" ? "iso" : "br";
}
