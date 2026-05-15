"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { shareTokens } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { requireMutation } from "@/lib/require-mutation";
import { vistoriaContext, vistoriaPath } from "@/lib/vistoria-context";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function createUploadTokenAction(
  vistoriaId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);
  if (ctx.vistoriaStatus === "finalizada") {
    throw new Error("Vistoria finalizada. Reabra antes de gerar um link.");
  }

  // Apenas um token de upload ativo por vistoria.
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

  revalidatePath(vistoriaPath(ctx));
}

export async function revokeUploadTokenAction(
  vistoriaId: string,
): Promise<void> {
  await requireMutation();
  const ctx = await vistoriaContext(vistoriaId);

  await db
    .delete(shareTokens)
    .where(
      and(
        eq(shareTokens.vistoriaId, vistoriaId),
        eq(shareTokens.permiteUpload, true),
      ),
    );

  revalidatePath(vistoriaPath(ctx));
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
