import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  escopoAchados,
  escopos,
  fotos,
  unidades,
} from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { isUuid } from "@/lib/route-params";
import { readFileBuffer } from "@/lib/storage";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { renderHtmlToPdf } from "@/lib/pdf";
import {
  renderEscopoPdfHtml,
  type PdfEscopoAchado,
  type PdfEscopoData,
  type PdfEscopoFoto,
  type PdfEscopoUnidade,
} from "@/components/pdf-escopo-template";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  _req: Request,
  { params }: { params: Promise<{ escopoId: string }> },
) {
  const { escopoId } = await params;
  if (!isUuid(escopoId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // PDF do escopo so e acessivel autenticado (sem token publico no MVP).
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [escopo] = await db
    .select()
    .from(escopos)
    .where(eq(escopos.id, escopoId))
    .limit(1);

  if (!escopo) {
    return NextResponse.json({ error: "escopo nao encontrado" }, { status: 404 });
  }

  const [emp] = await db
    .select()
    .from(empreendimentos)
    .where(eq(empreendimentos.id, escopo.empreendimentoId))
    .limit(1);

  if (!emp) {
    return NextResponse.json({ error: "empreendimento ausente" }, { status: 404 });
  }

  // Achados do escopo, com unidade, ordenados por unidade + ordem no escopo.
  const itens = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      status: achados.status,
      prazoEm: achados.prazoEm,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      unidadeOrdem: unidades.ordem,
      ordemNoEscopo: escopoAchados.ordem,
    })
    .from(escopoAchados)
    .innerJoin(achados, eq(achados.id, escopoAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(eq(escopoAchados.escopoId, escopoId))
    .orderBy(asc(unidades.ordem), asc(unidades.nome), asc(escopoAchados.ordem));

  // Pra cada achado, queremos as fotos do evento mais recente NAO-resolvido
  // (criado/persiste/nota). Resolvido pode aparecer mas sem fotos quando o
  // evento que mostrava o problema ja foi substituido. Em ultimo caso, pega
  // qualquer evento que tenha fotos.
  const achadoIds = itens.map((it) => it.achadoId);
  const fotosPorAchado = new Map<string, PdfEscopoFoto[]>();
  if (achadoIds.length > 0) {
    // Buscar todos os eventos dos achados, com fotos.
    const eventos = await db
      .select({
        achadoId: achadoEventos.achadoId,
        eventoId: achadoEventos.id,
        tipo: achadoEventos.tipo,
        createdAt: achadoEventos.createdAt,
      })
      .from(achadoEventos)
      .where(inArray(achadoEventos.achadoId, achadoIds))
      .orderBy(desc(achadoEventos.createdAt));

    // Escolher o evento mais recente que NAO seja "resolvido" pra mostrar
    // o estado problema. Se so tiver resolvido, pega ele mesmo.
    const eventoEscolhidoPorAchado = new Map<string, string>();
    for (const ev of eventos) {
      if (eventoEscolhidoPorAchado.has(ev.achadoId)) continue;
      if (ev.tipo !== "resolvido") {
        eventoEscolhidoPorAchado.set(ev.achadoId, ev.eventoId);
      }
    }
    // Pra achados ainda sem evento escolhido (so tem "resolvido"), pega o
    // primeiro da lista (que ja vem ordenada desc por data).
    for (const ev of eventos) {
      if (eventoEscolhidoPorAchado.has(ev.achadoId)) continue;
      eventoEscolhidoPorAchado.set(ev.achadoId, ev.eventoId);
    }

    const eventoIdsEscolhidos = Array.from(eventoEscolhidoPorAchado.values());
    const fotosRows =
      eventoIdsEscolhidos.length > 0
        ? await db
            .select({
              eventoId: fotos.achadoEventoId,
              thumbPath: fotos.thumbPath,
              legenda: fotos.legenda,
              ordem: fotos.ordem,
            })
            .from(fotos)
            .where(inArray(fotos.achadoEventoId, eventoIdsEscolhidos))
            .orderBy(asc(fotos.ordem))
        : [];

    // Mapear eventoId → achadoId pra agrupar fotos pelo achado.
    const eventoToAchado = new Map<string, string>();
    for (const [achadoId, eventoId] of eventoEscolhidoPorAchado.entries()) {
      eventoToAchado.set(eventoId, achadoId);
    }

    // Converter cada thumb em data URI (igual o PDF de vistoria faz).
    for (const f of fotosRows) {
      const achadoId = eventoToAchado.get(f.eventoId);
      if (!achadoId) continue;
      const dataUri = await fileToDataUri(f.thumbPath);
      if (!dataUri) continue;
      const arr = fotosPorAchado.get(achadoId) ?? [];
      arr.push({ dataUri, legenda: f.legenda });
      fotosPorAchado.set(achadoId, arr);
    }
  }

  // Agrupar itens por unidade pra o template.
  const gruposMap = new Map<string, PdfEscopoUnidade>();
  for (const it of itens) {
    const achado: PdfEscopoAchado = {
      achadoId: it.achadoId,
      categoria: it.categoria,
      local: it.local,
      descricao: it.descricao,
      prazoEmBR: it.prazoEm ? formatDateBR(it.prazoEm) : null,
      status: it.status,
      fotos: fotosPorAchado.get(it.achadoId) ?? [],
    };
    const g = gruposMap.get(it.unidadeId);
    if (g) g.achados.push(achado);
    else
      gruposMap.set(it.unidadeId, {
        unidadeId: it.unidadeId,
        unidadeNome: it.unidadeNome,
        achados: [achado],
      });
  }

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
      // fallback de texto no template se logo falhar
    }
  }

  const data: PdfEscopoData = {
    empreendimentoNome: emp.nome,
    empreendimentoCliente: emp.cliente,
    empreendimentoEndereco: emp.endereco,
    escopoNome: escopo.nome,
    escopoDescricao: escopo.descricao,
    unidades: Array.from(gruposMap.values()),
    totalAchados: itens.length,
    geradoEmBR: formatDateTimeBR(new Date()),
    logoDataUri,
  };

  const html = renderEscopoPdfHtml(data);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html);
  } catch (err) {
    console.error("[pdf-escopo] render failed", err);
    return NextResponse.json(
      { error: "Falha ao gerar PDF" },
      { status: 500 },
    );
  }

  const sanitize = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `escopo-${sanitize(emp.nome)}-${sanitize(escopo.nome)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
