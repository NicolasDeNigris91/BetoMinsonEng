/**
 * Detecta o "erro" sinalico que o Next.js lanca quando uma server action
 * chama redirect(). Nao e um erro real — e o mecanismo do framework pra
 * navegar. Catches em volta de server actions precisam rethrow esse sinal
 * ou (a) a navegacao do framework falha em alguns casos e (b) o
 * toast.error mostra "NEXT_REDIRECT" como se fosse falha real.
 *
 * Uso:
 *   try {
 *     await action();
 *   } catch (err) {
 *     if (isNextRedirectError(err)) throw err;
 *     toast.error(...);
 *   }
 */
export function isNextRedirectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    return true;
  }
  return err.message === "NEXT_REDIRECT";
}
