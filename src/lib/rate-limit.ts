import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Rate limiter backed by Postgres. Substitui o Map em memória anterior
 * que zerava a cada deploy/restart. Atômico via INSERT ... ON CONFLICT.
 *
 * Tabela: rate_limit_buckets(key PK, count, reset_at).
 *
 * Cleanup: rows expirados (reset_at < now) ficam até serem sobrescritos
 * pelo próximo hit naquela key. Como cada chave única é uma linha, a
 * tabela é naturalmente pequena (uma linha por IP/key ativo). Para
 * limpeza periódica, ver scripts/cleanup-rate-limit.ts (TODO).
 */

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

type BucketRow = { count: number; reset_at: Date };

export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  try {
    const result = await db.execute<BucketRow>(sql`
      INSERT INTO rate_limit_buckets (key, count, reset_at)
      VALUES (${key}, 1, NOW() + (${windowMs}::int * INTERVAL '1 millisecond'))
      ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN rate_limit_buckets.reset_at < NOW() THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_buckets.reset_at < NOW()
            THEN NOW() + (${windowMs}::int * INTERVAL '1 millisecond')
          ELSE rate_limit_buckets.reset_at
        END
      RETURNING count, reset_at
    `);

    // postgres-js retorna array com result rows direto
    const row = (result as unknown as BucketRow[])[0];
    if (!row) {
      // não deve acontecer com RETURNING, mas fail-open por segurança
      return { allowed: true, retryAfterSec: 0 };
    }

    if (row.count > limit) {
      const retryAfterMs = row.reset_at.getTime() - Date.now();
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    return { allowed: true, retryAfterSec: 0 };
  } catch (err) {
    // Fail-open: se o DB de rate-limit falhar, não trava o app.
    // Logar pra debug; quando Sentry estiver instalado, isso vai
    // gerar alerta.
    console.error("[rate-limit] query failed, failing open:", err);
    return { allowed: true, retryAfterSec: 0 };
  }
}
