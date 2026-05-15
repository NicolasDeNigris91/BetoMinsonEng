import "server-only";
import { headers } from "next/headers";
import { getSession } from "./auth";
import { redirect } from "next/navigation";
import { rateLimit } from "./rate-limit";

// Rate-limit por mutação. Cobre o caso de bug no front (loop infinito
// disparando uma server action) ou cliente abusivo. Login e /api/upload
// já têm seus próprios limites, esse aqui pega tudo o resto: create/
// update/delete de empreendimento, unidade, vistoria, achado, foto,
// share-token e upload-token.
//
// Limite folgado pro user humano: 100 mutações/min equivale a ~1.6/s
// sustentado, muito acima do que um operador clica em uma vistoria.
// Bug em loop bate em <1s.
const MUTATION_LIMIT = 100;
const MUTATION_WINDOW_MS = 60_000;

async function mutationKey(): Promise<string> {
  // Usuário logado: chave estável por sessão (loggedInAt). Single user
  // hoje colapsa todo mundo no mesmo bucket; quando tiver multi-user,
  // trocar pra session.userId aqui.
  const session = await getSession();
  if (session.loggedInAt) {
    return `mut:s:${session.loggedInAt}`;
  }
  // Sem sessão (não deveria chegar aqui — requireMutation chama
  // requireSession antes — mas defensivo): cai pro IP.
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip =
    xff?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `mut:ip:${ip}`;
}

/**
 * Substitui `requireSession()` em server actions que mutam estado.
 * Faz: 1) garante sessão (redireciona pra /login se não tiver);
 *      2) checa rate-limit; lança Error se excedeu (toast no client).
 */
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
