import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL not set");
    process.exit(1);
  }
  if (url.includes("build-placeholder") || url.includes("placeholder")) {
    console.error(
      "[migrate] DATABASE_URL is still the build-time placeholder.\n" +
        "  In Railway, the Next.js service Variables panel must have\n" +
        "  DATABASE_URL referencing ${{Postgres.DATABASE_URL}} (not a literal).",
    );
    process.exit(1);
  }

  console.log("[migrate] Connecting to database...");
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    console.log("[migrate] Ensuring pgcrypto extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    console.log("[migrate] Applying migrations from src/db/migrations ...");
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "./src/db/migrations" });

    console.log("[migrate] Done.");
  } catch (err) {
    console.error("[migrate] FAILED:");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
