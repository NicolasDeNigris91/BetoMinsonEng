"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { funcionarioAchados, funcionarios, mensagens } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import {
  FUNCIONARIOS_PATH,
  funcionarioContext,
  funcionarioPath,
} from "@/lib/funcionario-context";
import { invalidateMensagens } from "@/lib/cache-tags";
import {
  actionError,
  type VoidActionResult,
} from "@/lib/action-result";

const textoSchema = z
  .string()
  .trim()
  .min(1, "Mensagem vazia.")
  .max(2000, "Mensagem muito longa (máx. 2000 caracteres).");

// Protege contra achadoId forjado em mensagens com referencia.
async function achadoPertenceAoFuncionario(
  funcionarioId: string,
  achadoId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ achadoId: funcionarioAchados.achadoId })
    .from(funcionarioAchados)
    .where(
      and(
        eq(funcionarioAchados.funcionarioId, funcionarioId),
        eq(funcionarioAchados.achadoId, achadoId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function enviarMensagemAdminAction(
  funcionarioId: string,
  texto: string,
  achadoId?: string,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  const parsed = textoSchema.safeParse(texto);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Mensagem inválida.");
  }

  if (achadoId) {
    const ok = await achadoPertenceAoFuncionario(funcionarioId, achadoId);
    if (!ok) {
      return actionError("Achado não está atribuído a este funcionário.");
    }
  }

  await db.insert(mensagens).values({
    funcionarioId,
    autor: "engenharia",
    texto: parsed.data,
    achadoId: achadoId ?? null,
  });

  revalidatePath(funcionarioPath(funcionarioId));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateMensagens();
}

export async function marcarMensagensLidasAdminAction(
  funcionarioId: string,
): Promise<VoidActionResult> {
  await requireMutation();
  await funcionarioContext(funcionarioId);

  await db
    .update(mensagens)
    .set({ lidoEm: new Date() })
    .where(
      and(
        eq(mensagens.funcionarioId, funcionarioId),
        eq(mensagens.autor, "funcionario"),
        isNull(mensagens.lidoEm),
      ),
    );

  revalidatePath(funcionarioPath(funcionarioId));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateMensagens();
}

export async function enviarMensagemFuncionarioAction(
  token: string,
  texto: string,
  achadoId?: string,
): Promise<VoidActionResult> {
  const parsed = textoSchema.safeParse(texto);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Mensagem inválida.");
  }

  const [func] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .where(
      and(eq(funcionarios.token, token), isNull(funcionarios.desativadoEm)),
    )
    .limit(1);

  if (!func) {
    return actionError("Link inválido ou desativado.");
  }

  if (achadoId) {
    const ok = await achadoPertenceAoFuncionario(func.id, achadoId);
    if (!ok) {
      return actionError("Achado não está atribuído a você.");
    }
  }

  await db.insert(mensagens).values({
    funcionarioId: func.id,
    autor: "funcionario",
    texto: parsed.data,
    achadoId: achadoId ?? null,
  });

  revalidatePath(`/f/${token}`);
  revalidatePath(funcionarioPath(func.id));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateMensagens();
}

export async function marcarMensagensLidasFuncionarioAction(
  token: string,
): Promise<VoidActionResult> {
  const [func] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .where(
      and(eq(funcionarios.token, token), isNull(funcionarios.desativadoEm)),
    )
    .limit(1);

  if (!func) {
    return actionError("Link inválido ou desativado.");
  }

  await db
    .update(mensagens)
    .set({ lidoEm: new Date() })
    .where(
      and(
        eq(mensagens.funcionarioId, func.id),
        eq(mensagens.autor, "engenharia"),
        isNull(mensagens.lidoEm),
      ),
    );

  revalidatePath(`/f/${token}`);
  revalidatePath(funcionarioPath(func.id));
  revalidatePath(FUNCIONARIOS_PATH);
  invalidateMensagens();
}
