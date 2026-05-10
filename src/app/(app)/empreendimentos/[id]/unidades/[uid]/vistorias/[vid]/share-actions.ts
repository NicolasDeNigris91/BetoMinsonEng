"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { shareTokens, unidades, vistorias } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function pathBase(vistoriaId: string) {
  const [v] = await db
    .select({ unidadeId: vistorias.unidadeId })
    .from(vistorias)
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);
  if (!v) throw new Error("Vistoria não encontrada");
  const [u] = await db
    .select({ empreendimentoId: unidades.empreendimentoId })
    .from(unidades)
    .where(eq(unidades.id, v.unidadeId))
    .limit(1);
  if (!u) throw new Error("Unidade não encontrada");
  return `/empreendimentos/${u.empreendimentoId}/unidades/${v.unidadeId}/vistorias/${vistoriaId}`;
}

export async function createShareTokenAction(
  vistoriaId: string,
): Promise<{ url: string; expiraEm: string }> {
  await requireSession();

  const token = randomBytes(24).toString("hex");
  const expiraEm = new Date(Date.now() + SEVEN_DAYS_MS);

  await db.insert(shareTokens).values({
    vistoriaId,
    token,
    expiraEm,
  });

  revalidatePath(await pathBase(vistoriaId));

  return {
    url: `${env.BASE_URL}/v/${token}`,
    expiraEm: expiraEm.toISOString(),
  };
}

export async function revokeShareTokenAction(
  tokenId: string,
): Promise<void> {
  await requireSession();

  const [row] = await db
    .select({ vistoriaId: shareTokens.vistoriaId })
    .from(shareTokens)
    .where(eq(shareTokens.id, tokenId))
    .limit(1);

  if (!row) return;

  await db.delete(shareTokens).where(eq(shareTokens.id, tokenId));
  revalidatePath(await pathBase(row.vistoriaId));
}
