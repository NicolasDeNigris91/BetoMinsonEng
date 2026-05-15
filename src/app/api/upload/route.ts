import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { achadoEventos, fotos, shareTokens, vistorias } from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { processImage } from "@/lib/images";
import { rateLimit } from "@/lib/rate-limit";
import { saveFile } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024;
const UPLOAD_RATE_LIMIT = 200;
const UPLOAD_RATE_WINDOW_MS = 5 * 60 * 1000;

function clientKey(req: Request, uploadToken: string | null): string {
  if (uploadToken) return `upload:t:${uploadToken}`;
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `upload:ip:${ip}`;
}

const formSchema = z.object({
  achadoEventoId: z.string().uuid(),
});

async function uploadTokenAllowsVistoria(
  token: string,
  vistoriaId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: shareTokens.id })
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, token),
        eq(shareTokens.vistoriaId, vistoriaId),
        eq(shareTokens.permiteUpload, true),
        gt(shareTokens.expiraEm, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const uploadToken = url.searchParams.get("token");

  // Reject before parsing the body when there is no plausible auth.
  const sessionOk = await isLoggedIn();
  if (!sessionOk && !uploadToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await rateLimit({
    key: clientKey(req, uploadToken),
    limit: UPLOAD_RATE_LIMIT,
    windowMs: UPLOAD_RATE_WINDOW_MS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Muitos uploads. Aguarde ${limit.retryAfterSec}s.` },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo maior que 15MB" },
      { status: 413 },
    );
  }

  const form = await req.formData();
  const params = formSchema.safeParse({
    achadoEventoId: form.get("achadoEventoId"),
  });
  if (!params.success) {
    return NextResponse.json(
      { error: "Parâmetros inválidos" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo maior que 15MB" },
      { status: 413 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Tipo de arquivo não suportado" },
      { status: 415 },
    );
  }

  const [evento] = await db
    .select({
      id: achadoEventos.id,
      vistoriaId: achadoEventos.vistoriaId,
      vistoriaStatus: vistorias.status,
    })
    .from(achadoEventos)
    .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
    .where(eq(achadoEventos.id, params.data.achadoEventoId))
    .limit(1);

  if (!evento) {
    return NextResponse.json(
      { error: "Evento não encontrado" },
      { status: 404 },
    );
  }
  if (evento.vistoriaStatus === "finalizada") {
    return NextResponse.json(
      { error: "Vistoria finalizada. Reabra antes de adicionar fotos." },
      { status: 409 },
    );
  }

  if (!sessionOk) {
    const tokenOk = uploadToken
      ? await uploadTokenAllowsVistoria(uploadToken, evento.vistoriaId)
      : false;
    if (!tokenOk) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let processed;
  try {
    processed = await processImage(buffer);
  } catch (err) {
    console.error("[upload] processImage failed", err);
    return NextResponse.json(
      { error: "Falha ao processar imagem" },
      { status: 422 },
    );
  }

  const id = nanoid(12);
  const dir = evento.id;
  const arquivoPath = `${dir}/${id}-original.${processed.ext}`;
  const thumbPath = `${dir}/${id}-thumb.${processed.ext}`;

  await saveFile(arquivoPath, processed.original);
  await saveFile(thumbPath, processed.thumb);

  const existing = await db
    .select({ ordem: fotos.ordem })
    .from(fotos)
    .where(eq(fotos.achadoEventoId, evento.id));
  const nextOrdem =
    existing.length > 0 ? Math.max(...existing.map((e) => e.ordem)) + 1 : 0;

  const [foto] = await db
    .insert(fotos)
    .values({
      achadoEventoId: evento.id,
      arquivoPath,
      thumbPath,
      legenda: null,
      ordem: nextOrdem,
    })
    .returning();

  return NextResponse.json({ foto });
}
