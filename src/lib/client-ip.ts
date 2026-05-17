import "server-only";

/**
 * Extrai o IP do cliente do header X-Forwarded-For.
 *
 * Pega o ULTIMO hop (mais a direita), nao o primeiro. Por que:
 * cada proxy na cadeia anexa o IP que viu como cliente. Se o app esta
 * atras de exatamente 1 proxy confiavel (Railway, Cloudflare, etc), o
 * ultimo segmento e o IP setado por esse proxy a partir do socket real.
 * O primeiro segmento pode ser injetado pelo proprio cliente via header
 * forjado, anulando rate-limit por IP.
 *
 * Em dev local sem proxy, retorna "unknown" — todos os requests caem
 * no mesmo bucket de rate-limit, o que e o desejado.
 *
 * Se um dia o app passar a rodar atras de mais de 1 proxy, ajustar
 * NUM_TRUSTED_PROXIES pra contar do final.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      // Ultimo hop = quem o proxy mais externo confiavel registrou.
      return parts[parts.length - 1];
    }
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Variante para server actions que acessa headers via next/headers em vez
 * de Request. Mesma logica de ultimo hop.
 */
export function getClientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
