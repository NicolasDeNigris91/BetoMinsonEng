import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { funcionarios } from "@/db/schema";

export type FuncionarioCtx = {
  funcionarioId: string;
  nome: string;
  token: string;
  desativadoEm: Date | null;
};

export async function funcionarioContext(
  funcionarioId: string,
): Promise<FuncionarioCtx> {
  const [row] = await db
    .select({
      funcionarioId: funcionarios.id,
      nome: funcionarios.nome,
      token: funcionarios.token,
      desativadoEm: funcionarios.desativadoEm,
    })
    .from(funcionarios)
    .where(eq(funcionarios.id, funcionarioId))
    .limit(1);

  if (!row) throw new Error("Funcionário não encontrado.");
  return row;
}

export function funcionarioPath(funcionarioId: string): string {
  return `/funcionarios/${funcionarioId}`;
}

export const FUNCIONARIOS_PATH = "/funcionarios";
