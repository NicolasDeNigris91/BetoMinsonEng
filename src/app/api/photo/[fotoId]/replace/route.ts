import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { achadoEventos, fotos, vistorias } from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { isUuid } from "@/lib/route-params";
import { getClientIp } from "@/lib/client-ip";
import { detectImageKind } from "@/lib/image-mime";
import { processImage } from "@/lib/images";
import { rateLimit } from "@/lib/rate-limit";
import { deleteFile, saveFile } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024;
const RATE_LIMIT = 200;
const RATE_WINDOW_MS = 5 * 60 * 1000;

function clientKey(req: Request): string {
  return `photo-replace:ip:${getClientIp(req)}`;
}

/**
 * Substitui o conteudo binario de uma foto existente preservando id, ordem e
 * legenda. Use quando o usuario re-anotar uma foto que ja foi enviada — o
 * editor entrega um File novo, e este endpoint troca os bytes mantendo a
 * posicao da foto na galeria.
 *
 * Bloqueia em vistoria finalizada (mesmo criterio do /api/upload: so o
 * evento 'criado' eh travado, retroativos podem receber).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ fotoId: string }> },
) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await rateLimit({
    key: clientKey(req),
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
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

  const { fotoId } = await params;
  if (!isUuid(fotoId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo maior que 15MB" },
      { status: 413 },
    );
  }

  // Vide /api/upload — formData() crasha em body nao-multipart e queremos
  // devolver 400 limpo em vez de 500.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido (esperado multipart/form-data)" },
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = detectImageKind(buffer);
  if (kind === "unknown") {
    return NextResponse.json(
      { error: "Arquivo nao e uma imagem valida (JPEG, PNG, WEBP ou HEIC)" },
      { status: 415 },
    );
  }
  if (kind === "heic" || kind === "heif") {
    return NextResponse.json(
      {
        error:
          "Foto em formato HEIC nao e suportada. No iPhone: Ajustes > Camera > Formatos > Mais Compativel. Ou converta a foto antes de enviar.",
      },
      { status: 415 },
    );
  }

  const [foto] = await db
    .select({
      id: fotos.id,
      arquivoPath: fotos.arquivoPath,
      thumbPath: fotos.thumbPath,
      eventoId: fotos.achadoEventoId,
      eventoTipo: achadoEventos.tipo,
      vistoriaStatus: vistorias.status,
    })
    .from(fotos)
    .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
    .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
    .where(eq(fotos.id, fotoId))
    .limit(1);

  if (!foto) {
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }

  if (foto.vistoriaStatus === "finalizada" && foto.eventoTipo === "criado") {
    return NextResponse.json(
      {
        error:
          "Vistoria finalizada. Reabra antes de editar fotos do achado original.",
      },
      { status: 409 },
    );
  }

  let processed;
  try {
    processed = await processImage(buffer);
  } catch (err) {
    console.error("[photo/replace] processImage failed", err);
    return NextResponse.json(
      { error: "Falha ao processar imagem" },
      { status: 422 },
    );
  }

  // Gera caminhos novos pra evitar cache stale do navegador apontando pra
  // bytes antigos via mesma URL. Os arquivos antigos sao apagados depois.
  const id = nanoid(12);
  const dir = foto.eventoId;
  const novoArquivoPath = `${dir}/${id}-original.${processed.ext}`;
  const novoThumbPath = `${dir}/${id}-thumb.${processed.ext}`;

  await saveFile(novoArquivoPath, processed.original);
  await saveFile(novoThumbPath, processed.thumb);

  await db
    .update(fotos)
    .set({
      arquivoPath: novoArquivoPath,
      thumbPath: novoThumbPath,
    })
    .where(eq(fotos.id, fotoId));

  // Apaga os arquivos antigos depois de atualizar o DB pra reduzir risco
  // de inconsistencia caso a etapa de delete falhe.
  await Promise.all([
    deleteFile(foto.arquivoPath).catch(() => {}),
    deleteFile(foto.thumbPath).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true });
}
