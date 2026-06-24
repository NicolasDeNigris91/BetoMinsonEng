"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import {
  achados,
  funcionarioAchados,
  funcionarios,
  unidades,
  type Categoria,
} from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { requireSession } from "@/lib/auth";
import { invalidateFuncionarios } from "@/lib/cache-tags";
import {
  FUNCIONARIOS_PATH,
  funcionarioContext,
  funcionarioPath,
} from "@/lib/funcionario-context";
import {
  actionData,
  actionError,
  type DataActionResult,
  type VoidActionResult,
} from "@/lib/action-result";

export type CandidatoAchado = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  unidadeId: string;
  unidadeNome: string;
};

export type CandidatosLoadResult = {
  candidatos: CandidatoAchado[];
  atLimit: boolean;
};

const CANDIDATOS_LIMIT = 500;

const novoFuncionarioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório")
    .max(200, "Nome muito longo"),
});

export type NovoFuncionarioState = {
  fieldErrors?: Record<string, string>;
  error?: string;
};

function geraToken(): string {
  return randomBytes(24).toString("hex");
}

export async function createFuncionarioAction(
  _prev: NovoFuncionarioState,
  formData: FormData,
): Promise<NovoFuncionarioState> {
  await requireMutation();

  const parsed = novoFuncionarioSchema.safeParse({
    nome: formData.get("nome"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const [created] = await db
    .insert(funcionarios)
    .values({
      nome: parsed.data.nome,
      token: geraToken(),
    })
    .returning({ id: funcionarios.id });

  revalidatePath(FUNCIONARIOS_PATH);
  invalidateFuncionarios();

  redirect(funcionarioPath(created.id));
}

export async function updateFuncionarioAction(
  funcionarioId: string,
  _prev: NovoFuncionarioState,
  formData: FormData,
): Promise<NovoFuncionarioState> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  const parsed = novoFuncionarioSchema.safeParse({
    nome: formData.get("nome"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  await db
    .update(funcionarios)
    .set({
      nome: parsed.data.nome,
      atualizadoEm: new Date(),
    })
    .where(eq(funcionarios.id, funcionarioId));

  revalidatePath(FUNCIONARIOS_PATH);
  revalidatePath(funcionarioPath(funcionarioId));
  invalidateFuncionarios();
  return {};
}

export async function deleteFuncionarioAction(
  funcionarioId: string,
): Promise<void> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db.delete(funcionarios).where(eq(funcionarios.id, funcionarioId));

  invalidateFuncionarios();
  redirect(FUNCIONARIOS_PATH);
}

export async function deactivateFuncionarioAction(
  funcionarioId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db
    .update(funcionarios)
    .set({ desativadoEm: new Date(), atualizadoEm: new Date() })
    .where(
      and(
        eq(funcionarios.id, funcionarioId),
        sql`${funcionarios.desativadoEm} IS NULL`,
      ),
    );

  revalidatePath(FUNCIONARIOS_PATH);
  revalidatePath(funcionarioPath(funcionarioId));
  invalidateFuncionarios();
}

export async function reactivateFuncionarioAction(
  funcionarioId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db
    .update(funcionarios)
    .set({ desativadoEm: null, atualizadoEm: new Date() })
    .where(eq(funcionarios.id, funcionarioId));

  revalidatePath(FUNCIONARIOS_PATH);
  revalidatePath(funcionarioPath(funcionarioId));
  invalidateFuncionarios();
}

export async function regenerateTokenAction(
  funcionarioId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db
    .update(funcionarios)
    .set({ token: geraToken(), atualizadoEm: new Date() })
    .where(eq(funcionarios.id, funcionarioId));

  revalidatePath(FUNCIONARIOS_PATH);
  revalidatePath(funcionarioPath(funcionarioId));
  invalidateFuncionarios();
}

export async function atribuirAchadosAction(
  funcionarioId: string,
  achadoIds: string[],
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  if (achadoIds.length === 0) return;

  const existentes = await db
    .select({ id: achados.id })
    .from(achados)
    .where(inArray(achados.id, achadoIds));

  const existSet = new Set(existentes.map((r) => r.id));
  const invalid = achadoIds.filter((id) => !existSet.has(id));
  if (invalid.length > 0) {
    return actionError("Um ou mais achados não foram encontrados.");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(funcionarioAchados)
      .values(achadoIds.map((achadoId) => ({ funcionarioId, achadoId })))
      .onConflictDoNothing();
    await tx
      .update(funcionarios)
      .set({ atualizadoEm: new Date() })
      .where(eq(funcionarios.id, funcionarioId));
  });

  revalidatePath(funcionarioPath(funcionarioId));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateFuncionarios();
}

export async function loadCandidatosPorEmpreendimentoAction(
  funcionarioId: string,
  empreendimentoId: string,
): Promise<DataActionResult<CandidatosLoadResult>> {
  await requireSession();
  await funcionarioContext(funcionarioId);

  const rows = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      unidadeOrdem: unidades.ordem,
    })
    .from(achados)
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .leftJoin(
      funcionarioAchados,
      and(
        eq(funcionarioAchados.achadoId, achados.id),
        eq(funcionarioAchados.funcionarioId, funcionarioId),
      ),
    )
    .where(
      and(
        eq(unidades.empreendimentoId, empreendimentoId),
        eq(achados.status, "aberto"),
        isNull(funcionarioAchados.funcionarioId),
      ),
    )
    .orderBy(asc(unidades.ordem), asc(unidades.nome), asc(achados.ordem))
    .limit(CANDIDATOS_LIMIT + 1);

  const atLimit = rows.length > CANDIDATOS_LIMIT;
  const slice = atLimit ? rows.slice(0, CANDIDATOS_LIMIT) : rows;

  const candidatos: CandidatoAchado[] = slice.map((r) => ({
    achadoId: r.achadoId,
    categoria: r.categoria as Categoria,
    local: r.local,
    descricao: r.descricao,
    unidadeId: r.unidadeId,
    unidadeNome: r.unidadeNome,
  }));

  return actionData({ candidatos, atLimit });
}

export async function setPrioridadeAchadoAction(
  funcionarioId: string,
  achadoId: string,
  prioridade: "alta" | "media" | null,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db
    .update(funcionarioAchados)
    .set({ prioridade })
    .where(
      and(
        eq(funcionarioAchados.funcionarioId, funcionarioId),
        eq(funcionarioAchados.achadoId, achadoId),
      ),
    );

  revalidatePath(funcionarioPath(funcionarioId));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateFuncionarios();
}

export async function removerAchadoAction(
  funcionarioId: string,
  achadoId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db
    .delete(funcionarioAchados)
    .where(
      and(
        eq(funcionarioAchados.funcionarioId, funcionarioId),
        eq(funcionarioAchados.achadoId, achadoId),
      ),
    );

  await db
    .update(funcionarios)
    .set({ atualizadoEm: new Date() })
    .where(eq(funcionarios.id, funcionarioId));

  revalidatePath(funcionarioPath(funcionarioId));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateFuncionarios();
}
