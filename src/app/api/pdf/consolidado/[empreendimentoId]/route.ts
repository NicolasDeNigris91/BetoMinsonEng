import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  unidades,
  vistorias,
  type Categoria,
} from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { isUuid } from "@/lib/route-params";
import { readFileBuffer } from "@/lib/storage";
import { evaluatePrazo, formatDateBR, formatDateTimeBR } from "@/lib/format";
import { renderHtmlToPdf } from "@/lib/pdf";
import {
  renderConsolidadoHtml,
  type ConsolidadoData,
  type ConsolidadoKpiCategoria,
  type ConsolidadoUnidade,
  type ConsolidadoUnidadeAchado,
} from "@/components/pdf-consolidado-template";

export const runtime = "nodejs";
export const maxDuration = 60;

const CATEGORIAS: Categoria[] = ["ELE", "HID", "HVAC", "PISCINA", "ASP", "SIS"];

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
  { params }: { params: Promise<{ empreendimentoId: string }> },
) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { empreendimentoId } = await params;
  if (!isUuid(empreendimentoId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Empreendimento + lista de unidades (com ordem). Em paralelo: totais e
  // mapas usados pra preencher cada unidade.
  const [
    [emp],
    unidadesList,
    [vistoriasTotal],
    achadosTodos,
    ultimaVistoriaRows,
    tempoMedioRows,
  ] = await Promise.all([
    db
      .select()
      .from(empreendimentos)
      .where(eq(empreendimentos.id, empreendimentoId))
      .limit(1),
    db
      .select()
      .from(unidades)
      .where(eq(unidades.empreendimentoId, empreendimentoId))
      .orderBy(asc(unidades.ordem), asc(unidades.nome)),
    db
      .select({ n: count() })
      .from(vistorias)
      .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
      .where(eq(unidades.empreendimentoId, empreendimentoId)),
    // limit 20k: hard cap pra evitar OOM em empreendimentos grandes.
    db
      .select({
        id: achados.id,
        unidadeId: achados.unidadeId,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
        status: achados.status,
        prazoEm: achados.prazoEm,
        createdAt: achados.createdAt,
        ordem: achados.ordem,
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(unidades.empreendimentoId, empreendimentoId))
      .limit(20000),
    db
      .select({
        unidadeId: vistorias.unidadeId,
        data: sql<string>`max(${vistorias.data})`,
      })
      .from(vistorias)
      .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
      .where(eq(unidades.empreendimentoId, empreendimentoId))
      .groupBy(vistorias.unidadeId),
    // Tempo medio de resolucao por categoria — usa o evento 'resolvido'
    // mais antigo (em caso de toggles desfeitos antigos), embora normalmente
    // so haja um por achado.
    db
      .select({
        categoria: achados.categoria,
        diasAvg: sql<number>`avg(extract(epoch from (${achadoEventos.createdAt} - ${achados.createdAt})) / 86400)`,
        n: count(),
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .innerJoin(
        achadoEventos,
        and(
          eq(achadoEventos.achadoId, achados.id),
          eq(achadoEventos.tipo, "resolvido"),
        ),
      )
      .where(
        and(
          eq(unidades.empreendimentoId, empreendimentoId),
          eq(achados.status, "resolvido"),
        ),
      )
      .groupBy(achados.categoria),
  ]);

  if (!emp) {
    return NextResponse.json(
      { error: "empreendimento não encontrado" },
      { status: 404 },
    );
  }

  // KPIs por categoria — agrega abertos/resolvidos/atrasados dos achados,
  // une com tempo medio do query separado.
  const tempoMedioPorCategoria = new Map<Categoria, number>(
    tempoMedioRows.map((r) => [r.categoria as Categoria, Number(r.diasAvg)]),
  );

  const kpiAcc: Record<Categoria, { abertos: number; resolvidos: number; atrasados: number }> = {
    ELE: { abertos: 0, resolvidos: 0, atrasados: 0 },
    HID: { abertos: 0, resolvidos: 0, atrasados: 0 },
    HVAC: { abertos: 0, resolvidos: 0, atrasados: 0 },
    PISCINA: { abertos: 0, resolvidos: 0, atrasados: 0 },
    ASP: { abertos: 0, resolvidos: 0, atrasados: 0 },
    SIS: { abertos: 0, resolvidos: 0, atrasados: 0 },
  };

  let totalAbertos = 0;
  let totalAtrasados = 0;

  for (const a of achadosTodos) {
    const cat = a.categoria;
    if (a.status === "aberto") {
      kpiAcc[cat].abertos++;
      totalAbertos++;
      const prazo = evaluatePrazo(a.prazoEm);
      if (prazo?.kind === "atrasado") {
        kpiAcc[cat].atrasados++;
        totalAtrasados++;
      }
    } else {
      kpiAcc[cat].resolvidos++;
    }
  }

  const kpiPorCategoria: ConsolidadoKpiCategoria[] = CATEGORIAS
    .map<ConsolidadoKpiCategoria>((cat) => ({
      categoria: cat,
      abertos: kpiAcc[cat].abertos,
      resolvidos: kpiAcc[cat].resolvidos,
      atrasados: kpiAcc[cat].atrasados,
      tempoMedioDias: tempoMedioPorCategoria.get(cat) ?? null,
    }))
    // So mostra linhas que tem ALGUMA atividade — categoria zerada poluiria.
    .filter((r) => r.abertos > 0 || r.resolvidos > 0 || r.atrasados > 0)
    .sort((a, b) => b.abertos + b.atrasados - (a.abertos + a.atrasados));

  // Mapa unidadeId -> achados abertos (ja ordenados).
  const abertosByUnidade = new Map<string, typeof achadosTodos>();
  for (const a of achadosTodos) {
    if (a.status !== "aberto") continue;
    const arr = abertosByUnidade.get(a.unidadeId) ?? [];
    arr.push(a);
    abertosByUnidade.set(a.unidadeId, arr);
  }
  // Ordem: atrasados primeiro (prazo asc), depois com prazo definido (asc),
  // depois sem prazo (categoria, ordem).
  for (const arr of abertosByUnidade.values()) {
    arr.sort((a, b) => {
      const pa = a.prazoEm;
      const pb = b.prazoEm;
      if (pa && pb) return pa.localeCompare(pb);
      if (pa) return -1;
      if (pb) return 1;
      if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
      return a.ordem - b.ordem;
    });
  }

  // Contagem total de resolvidos por unidade (pra header de cada bloco).
  const resolvidosByUnidade = new Map<string, number>();
  for (const a of achadosTodos) {
    if (a.status === "resolvido") {
      resolvidosByUnidade.set(
        a.unidadeId,
        (resolvidosByUnidade.get(a.unidadeId) ?? 0) + 1,
      );
    }
  }

  const ultimaPorUnidade = new Map(
    ultimaVistoriaRows.map((r) => [r.unidadeId, r.data]),
  );

  const unidadesView: ConsolidadoUnidade[] = unidadesList.map((u) => {
    const abertos = abertosByUnidade.get(u.id) ?? [];
    const abertosPorCategoria: Record<Categoria, number> = {
      ELE: 0,
      HID: 0,
      HVAC: 0,
      PISCINA: 0,
      ASP: 0,
      SIS: 0,
    };
    for (const a of abertos) abertosPorCategoria[a.categoria]++;

    const achadosAbertosView: ConsolidadoUnidadeAchado[] = abertos.map((a) => {
      const p = evaluatePrazo(a.prazoEm);
      return {
        id: a.id,
        categoria: a.categoria,
        local: a.local,
        descricao: a.descricao,
        prazoTexto: p?.texto ?? "",
        prazoKind: p?.kind ?? "none",
      };
    });

    const ultima = ultimaPorUnidade.get(u.id);
    return {
      id: u.id,
      nome: u.nome,
      ultimaVistoriaBR: ultima ? formatDateBR(ultima) : null,
      abertos: abertos.length,
      resolvidos: resolvidosByUnidade.get(u.id) ?? 0,
      abertosPorCategoria,
      achadosAbertos: achadosAbertosView,
    };
  });

  // Logo: prefere o do empreendimento (campo logoUrl), cai pra logo da
  // DiMinson em public/logo-diminson.png.
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
      /* fallback to text rendering */
    }
  }

  const data: ConsolidadoData = {
    empreendimentoNome: emp.nome,
    empreendimentoCliente: emp.cliente,
    empreendimentoEndereco: emp.endereco,
    totalUnidades: unidadesList.length,
    totalVistorias: Number(vistoriasTotal?.n ?? 0),
    totalAbertos,
    totalAtrasados,
    kpiPorCategoria,
    unidades: unidadesView,
    geradoEmBR: formatDateTimeBR(new Date()),
    logoDataUri,
  };

  const html = renderConsolidadoHtml(data);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html);
  } catch (err) {
    console.error("[pdf-consolidado] render failed", err);
    return NextResponse.json(
      { error: "Falha ao gerar PDF" },
      { status: 500 },
    );
  }

  const sanitize = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `consolidado-${sanitize(emp.nome)}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
