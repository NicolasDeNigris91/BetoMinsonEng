import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/migrations");

/**
 * Migrations destrutivas (DROP CONSTRAINT/INDEX/COLUMN/TYPE) precisam usar
 * IF EXISTS. Sem isso, um DROP CASCADE anterior pode remover o objeto e a
 * próxima migration aborta numa transação compartilhada (regressão real
 * na 0017 quebrando o deploy em prod).
 */
describe("migrations safety", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

  for (const file of files) {
    it(`${file} — DROP destrutivo usa IF EXISTS`, () => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      // Casa "DROP CONSTRAINT", "DROP INDEX", "DROP COLUMN", "DROP TYPE"
      // sem o "IF EXISTS" no meio.
      const offenders = sql
        .split(/;\s*/)
        .map((stmt) => stmt.trim())
        .filter((stmt) =>
          /DROP\s+(CONSTRAINT|INDEX|COLUMN|TYPE)\b(?!\s+IF\s+EXISTS)/i.test(
            stmt,
          ),
        );
      expect(offenders, `Statement sem IF EXISTS em ${file}:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});
