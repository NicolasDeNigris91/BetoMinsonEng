import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[reset] DATABASE_URL not set");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    console.log("[reset] truncando todas as tabelas de dados");
    await db.execute(sql`
      TRUNCATE TABLE
        fotos,
        achado_eventos,
        share_tokens,
        escopo_share_tokens,
        escopo_achados,
        escopos,
        achados,
        vistorias,
        unidades,
        empreendimentos,
        usuarios,
        rate_limit_buckets
      RESTART IDENTITY CASCADE
    `);
    console.log("[reset] OK — banco vazio");
  } catch (err) {
    console.error("[reset] FAILED:");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
