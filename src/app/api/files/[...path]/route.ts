import { NextResponse } from "next/server";
import { eq, and, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { achadoEventos, fotos, shareTokens } from "@/db/schema";
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
  // Token só libera fotos cujo evento pertence à própria vistoria do token.
  // Match em arquivoPath OU thumbPath numa única query.
  const [row] = await db
    .select({ ownerVistoriaId: achadoEventos.vistoriaId })
    .from(shareTokens)
    .innerJoin(fotos, or(
      eq(fotos.arquivoPath, relativePath),
      eq(fotos.thumbPath, relativePath),
    ))
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .where(
      and(
        eq(shareTokens.token, token),
        gt(shareTokens.expiraEm, new Date()),
        eq(shareTokens.vistoriaId, achadoEventos.vistoriaId),
      ),
    )
    .limit(1);

  return !!row;
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
