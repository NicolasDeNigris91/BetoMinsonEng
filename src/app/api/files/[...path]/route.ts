import { NextResponse } from "next/server";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  fotos,
  shareTokens,
} from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { fileExists, readFileBuffer } from "@/lib/storage";

function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function isAccessibleViaToken(
  relativePath: string,
  token: string,
): Promise<boolean> {
  const [row] = await db
    .select({ vistoriaId: shareTokens.vistoriaId })
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, token),
        gt(shareTokens.expiraEm, new Date()),
      ),
    )
    .limit(1);

  if (!row) return false;

  const [byArquivo, byThumb, byAchadoOrigem] = await Promise.all([
    db
      .select({ vistoriaId: achadoEventos.vistoriaId })
      .from(fotos)
      .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
      .where(eq(fotos.arquivoPath, relativePath))
      .limit(1),
    db
      .select({ vistoriaId: achadoEventos.vistoriaId })
      .from(fotos)
      .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
      .where(eq(fotos.thumbPath, relativePath))
      .limit(1),
    db
      .select({ vistoriaOrigemId: achados.vistoriaOrigemId })
      .from(fotos)
      .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .where(eq(fotos.arquivoPath, relativePath))
      .limit(1),
  ]);

  if (byArquivo[0]?.vistoriaId === row.vistoriaId) return true;
  if (byThumb[0]?.vistoriaId === row.vistoriaId) return true;
  if (byAchadoOrigem[0]?.vistoriaOrigemId === row.vistoriaId) return true;

  return false;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const relativePath = path.join("/");

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const allowed =
    (await isLoggedIn()) ||
    (token ? await isAccessibleViaToken(relativePath, token) : false);

  if (!allowed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!fileExists(relativePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buffer = await readFileBuffer(relativePath);
  const ext = relativePath.split(".").pop() ?? "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
