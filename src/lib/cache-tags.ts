/**
 * Tags centralizadas pro sistema de cache do Next. Granularidade por
 * "colecao": qualquer mutacao em algum achado invalida 'achados', mesma
 * coisa pra vistorias/unidades/empreendimentos.
 *
 * Quem produz: queries que usam `unstable_cache` declaram seus tags com
 * uma ou mais constantes daqui.
 * Quem invalida: server actions de mutacao chamam `revalidateTag` com o
 * tag da colecao tocada.
 *
 * Quando o cache nao traz beneficio claro (query barata, ou pagina muito
 * dinamica) deixe `force-dynamic` e use `revalidatePath` normal — esses
 * tags so existem pra as queries explicitamente cacheadas com
 * unstable_cache.
 */
import { updateTag } from "next/cache";

export const CACHE_TAGS = {
  empreendimentos: "empreendimentos",
  unidades: "unidades",
  vistorias: "vistorias",
  achados: "achados",
  funcionarios: "funcionarios",
  mensagens: "mensagens",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * Helpers para mutacoes invalidarem o cache dashboard sem precisar pensar
 * em quais tags exatas tocar — basta declarar "essa mutacao mexeu em X".
 * Cada um inclui as tags afetadas, de forma que queries cacheadas com
 * `unstable_cache` re-rodem na proxima leitura.
 *
 * Usa `updateTag` (Next 16) em vez do `revalidateTag` legado — mesmo
 * efeito, API recomendada.
 */
export function invalidateAchados(): void {
  updateTag(CACHE_TAGS.achados);
}

export function invalidateVistorias(): void {
  updateTag(CACHE_TAGS.vistorias);
}

export function invalidateEmpreendimentos(): void {
  updateTag(CACHE_TAGS.empreendimentos);
}

export function invalidateUnidades(): void {
  updateTag(CACHE_TAGS.unidades);
}

export function invalidateFuncionarios(): void {
  updateTag(CACHE_TAGS.funcionarios);
}

export function invalidateMensagens(): void {
  updateTag(CACHE_TAGS.mensagens);
}
