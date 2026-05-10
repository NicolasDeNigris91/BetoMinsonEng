import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { achadoEventos, fotos, vistorias } from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { processImage } from "@/lib/images";
import { saveFile } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const querySchema = z.object({
  achadoEventoId: z.string().uuid(),
  legenda: z.string().optional(),
});

export async function POST(req: Request) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const params = querySchema.safeParse({
    achadoEventoId: form.get("achadoEventoId"),
    legenda: form.get("legenda") ?? undefined,
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
  if (!ACCEPTED.includes(file.type) && !file.type.startsWith("image/")) {
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

  const buffer = Buffer.from(await file.arrayBuffer());
  let processed;
  try {
    processed = await processImage(buffer);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Falha ao processar imagem",
        detail: err instanceof Error ? err.message : String(err),
      },
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
      legenda: params.data.legenda || null,
      ordem: nextOrdem,
    })
    .returning();

  return NextResponse.json({ foto });
}
