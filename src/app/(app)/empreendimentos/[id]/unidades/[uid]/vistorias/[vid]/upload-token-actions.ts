"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { shareTokens, unidades, vistorias } from "@/db/schema";
import { requireSession } from "@/lib/auth";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function vistoriaPagePath(vistoriaId: string): Promise<string> {
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

export async function createUploadTokenAction(
  vistoriaId: string,
): Promise<void> {
  await requireSession();

  const [v] = await db
    .select({ status: vistorias.status })
    .from(vistorias)
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);
  if (!v) throw new Error("Vistoria não encontrada");
  if (v.status === "finalizada") {
    throw new Error("Vistoria finalizada. Reabra antes de gerar um link.");
  }

  // Revoke any existing upload token for this vistoria — only one active at a time
  await db
    .delete(shareTokens)
    .where(
      and(
        eq(shareTokens.vistoriaId, vistoriaId),
        eq(shareTokens.permiteUpload, true),
      ),
    );

  const token = randomBytes(24).toString("hex");
  const expiraEm = new Date(Date.now() + TWENTY_FOUR_HOURS_MS);

  await db.insert(shareTokens).values({
    vistoriaId,
    token,
    expiraEm,
    permiteUpload: true,
  });

  revalidatePath(await vistoriaPagePath(vistoriaId));
}

export async function revokeUploadTokenAction(
  vistoriaId: string,
): Promise<void> {
  await requireSession();

  await db
    .delete(shareTokens)
    .where(
      and(
        eq(shareTokens.vistoriaId, vistoriaId),
        eq(shareTokens.permiteUpload, true),
      ),
    );

  revalidatePath(await vistoriaPagePath(vistoriaId));
}

export async function getActiveUploadTokenAction(
  vistoriaId: string,
): Promise<{ token: string; expiraEm: string } | null> {
  await requireSession();

  const [row] = await db
    .select({ token: shareTokens.token, expiraEm: shareTokens.expiraEm })
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.vistoriaId, vistoriaId),
        eq(shareTokens.permiteUpload, true),
        gt(shareTokens.expiraEm, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  return { token: row.token, expiraEm: row.expiraEm.toISOString() };
}
