// Env vars necessárias pra que lib/env.ts (validação no import) não
// falhe quando os módulos de produção são importados em testes.
//
// Usamos atribuição direta (não ??=) pra garantir override de qualquer
// valor herdado do shell ou de plugins que carreguem .env.local.
process.env.DATABASE_URL = "postgres://test-placeholder@localhost:5432/test";
process.env.APP_PASSWORD = "test-password-123";
process.env.SESSION_SECRET =
  "test_session_secret_at_least_32_chars_long_xxxx";
process.env.BASE_URL = "http://localhost:3000";

// NODE_ENV é tipado como readonly em @types/node — Object.assign contorna
// sem precisar de cast inseguro.
Object.assign(process.env, { NODE_ENV: "test" });
