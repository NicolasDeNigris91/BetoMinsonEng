"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { shareTokens } from "@/db/schema";
import { requireMutation } from "@/lib/require-mutation";
import { env } from "@/lib/env";
import { vistoriaContext, vistoriaPath } from "@/lib/vistoria-context";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function createShareTokenAction(
  vistoriaId: string,
): Promise<{ url: string; expiraEm: string }> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  const token = randomBytes(24).toString("hex");
  const expiraEm = new Date(Date.now() + SEVEN_DAYS_MS);

  await db.insert(shareTokens).values({
    vistoriaId,
    token,
    expiraEm,
  });

  revalidatePath(vistoriaPath(ctx));

  return {
    url: `${env.BASE_URL}/v/${token}`,
    expiraEm: expiraEm.toISOString(),
  };
}

export async function revokeShareTokenAction(
  vistoriaId: string,
  tokenId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  // Restringir o delete ao par (id, vistoriaId) — evita revogar token
  // de outra vistoria via id forjado.
  const result = await db
    .delete(shareTokens)
    .where(
      and(eq(shareTokens.id, tokenId), eq(shareTokens.vistoriaId, vistoriaId)),
    )
    .returning({ id: shareTokens.id });

  if (result.length === 0) return;
  revalidatePath(vistoriaPath(ctx));
}
