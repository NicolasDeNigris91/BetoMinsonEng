import { NextResponse } from "next/server";
import { eq, and, gt, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  empreendimentos,
  fotos,
  shareTokens,
  unidades,
  vistorias,
} from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { readFileBuffer } from "@/lib/storage";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { renderHtmlToPdf } from "@/lib/pdf";
import {
  renderPdfHtml,
  type PdfData,
  type PdfFoto,
  type PdfRow,
} from "@/components/pdf-template";

export const runtime = "nodejs";
export const maxDuration = 60;

async function isAuthorized(
  vistoriaId: string,
  token: string | null,
): Promise<boolean> {
  if (await isLoggedIn()) return true;
  if (!token) return false;
  const [row] = await db
    .select({ vistoriaId: shareTokens.vistoriaId })
    .from(shareTokens)
    .where(
      and(eq(shareTokens.token, token), gt(shareTokens.expiraEm, new Date())),
    )
    .limit(1);
  return Boolean(row && row.vistoriaId === vistoriaId);
}

async function fileToDataUri(relativePath: string): Promise<string | null> {
  try {
    const buf = await readFileBuffer(relativePath);
    const ext = relativePath.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ vistoriaId: string }> },
) {
  const { vistoriaId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!(await isAuthorized(vistoriaId, token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [vistoria] = await db
    .select()
    .from(vistorias)
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);

  if (!vistoria) {
    return NextResponse.json({ error: "vistoria não encontrada" }, { status: 404 });
  }

  const [unidade] = await db
    .select()
    .from(unidades)
    .where(eq(unidades.id, vistoria.unidadeId))
    .limit(1);
  const [emp] = unidade
    ? await db
        .select()
        .from(empreendimentos)
        .where(eq(empreendimentos.id, unidade.empreendimentoId))
        .limit(1)
    : [];

  if (!unidade || !emp) {
    return NextResponse.json({ error: "dados ausentes" }, { status: 404 });
  }

  const eventos = await db.query.achadoEventos.findMany({
    where: eq(achadoEventos.vistoriaId, vistoriaId),
    with: { fotos: { orderBy: asc(fotos.ordem) }, achado: true },
    orderBy: asc(achadoEventos.createdAt),
  });

  const rows: PdfRow[] = [];
  for (const ev of eventos) {
    if (!ev.achado) continue;
    const fotosWithData: PdfFoto[] = [];
    for (const f of ev.fotos) {
      const dataUri = await fileToDataUri(f.thumbPath);
      if (dataUri) {
        fotosWithData.push({ dataUri, legenda: f.legenda });
      }
    }
    rows.push({
      achadoId: ev.achado.id,
      categoria: ev.achado.categoria,
      local: ev.achado.local,
      descricao: ev.achado.descricao,
      evento: {
        id: ev.id,
        tipo: ev.tipo,
        notaExtra: ev.notaExtra,
        fotos: fotosWithData,
      },
    });
  }

  rows.sort((a, b) => {
    if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
    return 0;
  });

  let logoDataUri: string | null = null;
  if (emp.logoUrl) {
    if (emp.logoUrl.startsWith("data:")) {
      logoDataUri = emp.logoUrl;
    } else if (!emp.logoUrl.startsWith("http")) {
      logoDataUri = await fileToDataUri(emp.logoUrl);
    }
  }

  const data: PdfData = {
    empreendimentoNome: emp.nome,
    empreendimentoCliente: emp.cliente,
    empreendimentoEndereco: emp.endereco,
    unidadeNome: unidade.nome,
    vistoriaDataBR: formatDateBR(vistoria.data),
    vistoriadorNome: vistoria.vistoriadorNome,
    observacoesGerais: vistoria.observacoesGerais,
    rows,
    finalizadaEmBR: vistoria.finalizadaEm
      ? formatDateTimeBR(vistoria.finalizadaEm)
      : null,
    geradoEmBR: formatDateTimeBR(new Date()),
    logoDataUri,
  };

  const html = renderPdfHtml(data);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html);
  } catch (err) {
    console.error("PDF render error", err);
    return NextResponse.json(
      {
        error: "Falha ao gerar PDF",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const filename = `vistoria-${unidade.nome.replace(/[^a-z0-9-_]+/gi, "_")}-${vistoria.data}.pdf`;

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
