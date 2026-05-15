// Stub pra `next/headers` em testes que importam módulos do servidor.
// Nenhum teste atual chama essas funções — se algum precisar, mockar
// explicitamente com vi.mock().
export function cookies(): never {
  throw new Error(
    "[test] next/headers cookies() called — mock no teste se precisar.",
  );
}
export function headers(): never {
  throw new Error("[test] next/headers headers() called — mock no teste.");
}
