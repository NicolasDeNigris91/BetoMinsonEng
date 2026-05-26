import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { differenceInCalendarDays } from "date-fns";
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
  type PdfEscopoCompare,
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
      achadoCreatedAt: achados.createdAt,
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

  // Pra cada achado pegamos DOIS eventos:
  //  - ANTES: o mais recente não-resolvido (criado/persiste/nota). Sempre
  //    existe (todo achado nasce com um "criado"), mas pode nao ter foto.
  //  - DEPOIS: o mais recente "resolvido". So existe quando o achado foi
  //    marcado como resolvido em alguma vistoria.
  // Achado aberto renderiza grid normal das fotos do ANTES.
  // Achado resolvido renderiza compare antes -> depois.
  const achadoIds = itens.map((it) => it.achadoId);
  type EventoAntes = {
    eventoId: string;
    tipo: "criado" | "persiste" | "nota";
    createdAt: Date;
  };
  type EventoDepois = { eventoId: string; createdAt: Date };
  const antesPorAchado = new Map<string, EventoAntes>();
  const depoisPorAchado = new Map<string, EventoDepois>();
  const fotosPorEvento = new Map<string, PdfEscopoFoto[]>();

  if (achadoIds.length > 0) {
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

    // Eventos ja vem ordenados desc por data, entao o primeiro de cada
    // categoria encontrado eh o mais recente.
    for (const ev of eventos) {
      if (ev.tipo === "resolvido") {
        if (!depoisPorAchado.has(ev.achadoId)) {
          depoisPorAchado.set(ev.achadoId, {
            eventoId: ev.eventoId,
            createdAt: ev.createdAt,
          });
        }
      } else {
        if (!antesPorAchado.has(ev.achadoId)) {
          antesPorAchado.set(ev.achadoId, {
            eventoId: ev.eventoId,
            tipo: ev.tipo,
            createdAt: ev.createdAt,
          });
        }
      }
    }

    const eventoIdsTodos = [
      ...Array.from(antesPorAchado.values()).map((e) => e.eventoId),
      ...Array.from(depoisPorAchado.values()).map((e) => e.eventoId),
    ];

    const fotosRows =
      eventoIdsTodos.length > 0
        ? await db
            .select({
              eventoId: fotos.achadoEventoId,
              thumbPath: fotos.thumbPath,
              legenda: fotos.legenda,
              ordem: fotos.ordem,
            })
            .from(fotos)
            .where(inArray(fotos.achadoEventoId, eventoIdsTodos))
            .orderBy(asc(fotos.ordem))
        : [];

    // Converter cada thumb em data URI e agrupar por evento.
    for (const f of fotosRows) {
      const dataUri = await fileToDataUri(f.thumbPath);
      if (!dataUri) continue;
      const arr = fotosPorEvento.get(f.eventoId) ?? [];
      arr.push({ dataUri, legenda: f.legenda });
      fotosPorEvento.set(f.eventoId, arr);
    }
  }

  // Agrupar itens por unidade pra o template.
  const gruposMap = new Map<string, PdfEscopoUnidade>();
  for (const it of itens) {
    const antes = antesPorAchado.get(it.achadoId);
    const depois = depoisPorAchado.get(it.achadoId);
    const fotosAntes = antes ? fotosPorEvento.get(antes.eventoId) ?? [] : [];
    const fotosDepois = depois ? fotosPorEvento.get(depois.eventoId) ?? [] : [];

    let compare: PdfEscopoCompare | null = null;
    let fotosGrid: PdfEscopoFoto[] = [];

    if (
      it.status === "resolvido" &&
      (fotosAntes.length > 0 || fotosDepois.length > 0)
    ) {
      const dias = depois
        ? differenceInCalendarDays(depois.createdAt, it.achadoCreatedAt)
        : null;
      compare = {
        antes: fotosAntes[0] ?? null,
        antesTipo: antes?.tipo ?? null,
        antesDataBR: antes ? formatDateBR(antes.createdAt) : null,
        depois: fotosDepois[0] ?? null,
        depoisDataBR: depois ? formatDateBR(depois.createdAt) : null,
        diasParaResolver: dias != null ? Math.max(0, dias) : null,
      };
    } else {
      // Aberto: grid de fotos do ANTES (mesma UX de antes).
      // Resolvido sem nenhuma foto: cai aqui tambem e nao renderiza nada.
      fotosGrid = fotosAntes;
    }

    const achado: PdfEscopoAchado = {
      achadoId: it.achadoId,
      categoria: it.categoria,
      local: it.local,
      descricao: it.descricao,
      prazoEmBR: it.prazoEm ? formatDateBR(it.prazoEm) : null,
      status: it.status,
      fotos: fotosGrid,
      compare,
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
