import "server-only";
import { headers } from "next/headers";
import { getSession } from "./auth";
import { getClientIpFromHeaders } from "./client-ip";
import { redirect } from "next/navigation";
import { rateLimit } from "./rate-limit";

// 100/min = ~1.6/s sustentado: folgado pro user, bug em loop bate em <1s.
const MUTATION_LIMIT = 100;
const MUTATION_WINDOW_MS = 60_000;

async function mutationKey(): Promise<string> {
  const session = await getSession();
  if (session.loggedInAt) {
    // TODO multi-user: trocar pra session.userId.
    return `mut:s:${session.loggedInAt}`;
  }
  // Fallback defensivo — requireMutation chama requireSession antes.
  const h = await headers();
  return `mut:ip:${getClientIpFromHeaders(h)}`;
}

export async function requireMutation(): Promise<void> {
  const session = await getSession();
  if (!session.loggedInAt) {
    redirect("/login");
  }

  const key = await mutationKey();
  const result = await rateLimit({
    key,
    limit: MUTATION_LIMIT,
    windowMs: MUTATION_WINDOW_MS,
  });
  if (!result.allowed) {
    throw new Error(
      `Muitas requisições em pouco tempo. Aguarde ${result.retryAfterSec}s e tente novamente.`,
    );
  }
}
