// Graceful shutdown — Node-only.
//
// Registra handlers de SIGTERM (Railway redeploy) e SIGINT (Ctrl+C local)
// pra fechar Chromium e pool de Postgres antes do processo morrer.
// Sem isso: uploads/PDFs em vôo morrem cortados, arquivos órfãos podem
// ficar no disco, pool de pg fica preso ate o processo terminar.

import { closeBrowser } from "@/lib/pdf";
import { closeDb } from "@/db";

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[instrumentation] recebido ${signal}, encerrando…`);

  const timeoutMs = 8000;
  const work = Promise.allSettled([closeBrowser(), closeDb()]);
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));

  await Promise.race([work, timeout]);
  console.log("[instrumentation] shutdown concluido");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
