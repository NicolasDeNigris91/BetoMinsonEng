import "server-only";

/**
 * Rate limiter em memoria do processo. Suficiente pra Railway single-instance.
 * Se um dia rodar em multi-instance, trocar por um store externo (Redis).
 *
 * NAO usa LRU sofisticado; janelas viradas sao limpas no proximo acesso.
 */

type Window = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Window>();
const CLEANUP_THRESHOLD = 10_000;

function sweepExpired(now: number): void {
  for (const [k, w] of buckets) {
    if (w.resetAt < now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

export function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const w = buckets.get(key);

  if (!w || w.resetAt < now) {
    if (buckets.size > CLEANUP_THRESHOLD) sweepExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (w.count < limit) {
    w.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  return {
    allowed: false,
    retryAfterSec: Math.ceil((w.resetAt - now) / 1000),
  };
}
