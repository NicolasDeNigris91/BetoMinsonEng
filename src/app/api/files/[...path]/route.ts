import { NextResponse } from "next/server";
import { eq, and, gt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  fotos,
  funcionarioAchados,
  funcionarios,
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

async function isAccessibleViaFuncionarioToken(
  relativePath: string,
  token: string,
): Promise<boolean> {
  const [execRow] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .innerJoin(
      achadoEventos,
      eq(achadoEventos.funcionarioOrigemId, funcionarios.id),
    )
    .innerJoin(
      fotos,
      and(
        eq(fotos.achadoEventoId, achadoEventos.id),
        or(
          eq(fotos.arquivoPath, relativePath),
          eq(fotos.thumbPath, relativePath),
        ),
      ),
    )
    .where(
      and(
        eq(funcionarios.token, token),
        isNull(funcionarios.desativadoEm),
      ),
    )
    .limit(1);

  if (execRow) return true;

  const [contextoRow] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .innerJoin(
      funcionarioAchados,
      eq(funcionarioAchados.funcionarioId, funcionarios.id),
    )
    .innerJoin(
      achadoEventos,
      and(
        eq(achadoEventos.achadoId, funcionarioAchados.achadoId),
        eq(achadoEventos.tipo, "criado"),
      ),
    )
    .innerJoin(
      fotos,
      and(
        eq(fotos.achadoEventoId, achadoEventos.id),
        or(
          eq(fotos.arquivoPath, relativePath),
          eq(fotos.thumbPath, relativePath),
        ),
      ),
    )
    .where(
      and(
        eq(funcionarios.token, token),
        isNull(funcionarios.desativadoEm),
      ),
    )
    .limit(1);

  return !!contextoRow;
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
    (token
      ? (await isAccessibleViaToken(relativePath, token)) ||
        (await isAccessibleViaFuncionarioToken(relativePath, token))
      : false);

  if (!allowed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // safeJoin lanca em path traversal — captura aqui pra devolver 400
  // limpo em vez de 500 com stack.
  let exists = false;
  try {
    exists = fileExists(relativePath);
  } catch {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  if (!exists) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFileBuffer(relativePath);
  } catch {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  const ext = relativePath.split(".").pop() ?? "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
