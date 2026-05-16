/**
 * Resultado tipado de Server Actions pra erros esperados de validacao /
 * regra de negocio.
 *
 * Por que existe: em producao o Next ofusca `err.message` de throws em
 * server actions (substitui por "An error occurred in the Server
 * Components render...") — proposital, pra nao vazar internals. Isso
 * significa que `throw new Error("Vistoria finalizada.")` chega no
 * cliente como string opaca, e qualquer `toast.error(err.message)` mostra
 * lixo. Pattern oficial: retornar o erro como valor.
 *
 * Quando usar:
 *   - Validacao de regra de negocio: `return actionError("...")`
 *   - Erro inesperado (bug, DB down): continuar com `throw` — cai no
 *     error.tsx mais proximo, comportamento correto.
 *
 * Uso no client:
 *   const result = await someAction();
 *   if (result?.error) toast.error(result.error);
 */

export type ActionError = { error: string };

/** Result type pra actions void. `void`/`undefined` = sucesso. */
export type VoidActionResult = ActionError | void;

/** Result type pra actions que retornam dados em sucesso. */
export type DataActionResult<T> = ActionError | { data: T };

export function actionError(error: string): ActionError {
  return { error };
}

export function actionData<T>(data: T): { data: T } {
  return { data };
}

/** Type guard pra distinguir sucesso de erro em DataActionResult. */
export function isActionError<T>(
  result: ActionError | { data: T },
): result is ActionError {
  return "error" in result;
}
