// Hook do Next.js executado uma vez no boot do servidor.
// Importe condicional pra evitar que o bundler Edge tente puxar
// playwright/postgres (que sao Node-only).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
