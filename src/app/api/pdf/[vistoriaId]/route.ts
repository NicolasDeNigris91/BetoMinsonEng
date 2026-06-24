import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, and, gt, gte, lte, asc, count } from "drizzle-orm";
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
import { isUuid } from "@/lib/route-params";
import { readFileBuffer } from "@/lib/storage";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { renderHtmlToPdf } from "@/lib/pdf";
import {
  renderPdfHtml,
  escapeHtml,
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
  // permiteUpload=true e pro celular do mestre-de-obras, nao pra
  // cliente externo ler o PDF inteiro.
  const [row] = await db
    .select({ vistoriaId: shareTokens.vistoriaId })
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, token),
        eq(shareTokens.permiteUpload, false),
        gt(shareTokens.expiraEm, new Date()),
      ),
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
  // Cast UUID no SELECT estoura 500 com id invalido — vaza que a rota
  // existe. 404 explicito antes da query.
  if (!isUuid(vistoriaId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!(await isAuthorized(vistoriaId, token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [[vistoria], eventos] = await Promise.all([
    db
      .select()
      .from(vistorias)
      .where(eq(vistorias.id, vistoriaId))
      .limit(1),
    db.query.achadoEventos.findMany({
      where: eq(achadoEventos.vistoriaId, vistoriaId),
      with: {
        fotos: { orderBy: asc(fotos.ordem) },
        achado: true,
        funcionarioOrigem: true,
      },
      orderBy: asc(achadoEventos.createdAt),
    }),
  ]);

  if (!vistoria) {
    return NextResponse.json({ error: "vistoria não encontrada" }, { status: 404 });
  }

  const [[unidade], [emp]] = await Promise.all([
    db
      .select()
      .from(unidades)
      .where(eq(unidades.id, vistoria.unidadeId))
      .limit(1),
    db
      .select()
      .from(empreendimentos)
      .innerJoin(unidades, eq(empreendimentos.id, unidades.empreendimentoId))
      .where(eq(unidades.id, vistoria.unidadeId))
      .limit(1)
      .then((rows) =>
        rows.map((r) => r.empreendimentos),
      ),
  ]);

  if (!unidade || !emp) {
    return NextResponse.json({ error: "dados ausentes" }, { status: 404 });
  }

  const rows: PdfRow[] = await Promise.all(
    eventos
      .filter((ev) => ev.achado != null)
      .map(async (ev) => {
        const fotosWithData = (
          await Promise.all(
            ev.fotos.map(async (f) => {
              const dataUri = await fileToDataUri(f.thumbPath);
              return dataUri ? { dataUri, legenda: f.legenda } : null;
            }),
          )
        ).filter((x): x is PdfFoto => x !== null);

        return {
          achadoId: ev.achado!.id,
          categoria: ev.achado!.categoria,
          local: ev.achado!.local,
          descricao: ev.achado!.descricao,
          evento: {
            id: ev.id,
            tipo: ev.tipo,
            createdAtBR: formatDateTimeBR(ev.createdAt),
            notaExtra: ev.notaExtra,
            fotos: fotosWithData,
          },
          funcionarioOrigemNome: ev.funcionarioOrigem?.nome ?? null,
        };
      }),
  );

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
  if (!logoDataUri) {
    try {
      const brandPath = path.join(process.cwd(), "public", "logo-diminson.png");
      const buf = await readFile(brandPath);
      logoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
    }
  }

  const year = vistoria.createdAt.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const [rankRow] = await db
    .select({ n: count() })
    .from(vistorias)
    .where(
      and(
        gte(vistorias.createdAt, startOfYear),
        lte(vistorias.createdAt, vistoria.createdAt),
      ),
    );
  const rank = Math.max(1, Number(rankRow?.n ?? 1));
  const protocolo = `VST-${year}-${String(rank).padStart(3, "0")}`;
  const isRascunho = vistoria.status === "rascunho";

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
    protocolo,
    isRascunho,
  };

  const html = renderPdfHtml(data);

  // Chromium renderiza em <head>-less inline; estilos precisam ser
  // todos inline ou em <style>.
  const footerTemplate = `
    <style>
      .pdf-footer-inner {
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-size: 8px;
        width: 100%;
        padding: 0 10mm;
        color: #64748b;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .pdf-footer-inner strong { color: #0f1e3a; font-weight: 700; }
    </style>
    <div class="pdf-footer-inner">
      <span><strong>DiMinson Engenharia</strong> · ${escapeHtml(emp.nome)} · ${escapeHtml(unidade.nome)} · ${escapeHtml(formatDateBR(vistoria.data))}</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span> · ${escapeHtml(protocolo)}</span>
    </div>
  `;

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html, { footerTemplate });
  } catch (err) {
    console.error("[pdf] render failed", err);
    return NextResponse.json(
      { error: "Falha ao gerar PDF" },
      { status: 500 },
    );
  }

  const sanitize = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `vistoria-${sanitize(emp.nome)}-${sanitize(unidade.nome)}-${vistoria.data}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
