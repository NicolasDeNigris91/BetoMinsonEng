import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  funcionarioAchados,
  funcionarios,
  unidades,
} from "@/db/schema";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { renderHtmlToPdf } from "@/lib/pdf";
import {
  escapeHtml,
  renderChecklistHtml,
  type ChecklistData,
  type ChecklistGrupo,
  type ChecklistItem,
  type ChecklistUnidade,
} from "@/components/pdf-funcionario-template";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  const empreendimentoFiltro = url.searchParams.get("empreendimento");

  const [func] = await db
    .select({ id: funcionarios.id, nome: funcionarios.nome })
    .from(funcionarios)
    .where(
      and(eq(funcionarios.token, token), isNull(funcionarios.desativadoEm)),
    )
    .limit(1);

  if (!func) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      prazoEm: achados.prazoEm,
      prioridade: funcionarioAchados.prioridade,
      unidadeNome: unidades.nome,
      unidadeOrdem: unidades.ordem,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
      empreendimentoEndereco: empreendimentos.endereco,
    })
    .from(funcionarioAchados)
    .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .innerJoin(empreendimentos, eq(empreendimentos.id, unidades.empreendimentoId))
    .where(
      and(
        eq(funcionarioAchados.funcionarioId, func.id),
        ne(achados.status, "resolvido"),
        empreendimentoFiltro
          ? eq(empreendimentos.id, empreendimentoFiltro)
          : undefined,
      ),
    )
    .orderBy(
      asc(empreendimentos.nome),
      asc(unidades.ordem),
      sql`case ${funcionarioAchados.prioridade} when 'alta' then 0 when 'media' then 1 else 2 end`,
      asc(achados.ordem),
    );

  const hojeISO = new Date().toISOString().slice(0, 10);

  const porEmp = new Map<
    string,
    {
      empreendimentoNome: string;
      empreendimentoEndereco: string | null;
      unidades: Map<string, ChecklistUnidade>;
    }
  >();
  for (const r of rows) {
    let g = porEmp.get(r.empreendimentoId);
    if (!g) {
      g = {
        empreendimentoNome: r.empreendimentoNome,
        empreendimentoEndereco: r.empreendimentoEndereco,
        unidades: new Map(),
      };
      porEmp.set(r.empreendimentoId, g);
    }
    let u = g.unidades.get(r.unidadeNome);
    if (!u) {
      u = { unidadeNome: r.unidadeNome, itens: [] };
      g.unidades.set(r.unidadeNome, u);
    }
    const item: ChecklistItem = {
      achadoId: r.achadoId,
      categoria: r.categoria,
      local: r.local,
      descricao: r.descricao,
      prioridade: r.prioridade,
      prazoEmBR: r.prazoEm ? formatDateBR(r.prazoEm) : null,
      prazoVencido: Boolean(r.prazoEm && r.prazoEm < hojeISO),
    };
    u.itens.push(item);
  }

  const grupos: ChecklistGrupo[] = Array.from(porEmp.values()).map((g) => ({
    empreendimentoNome: g.empreendimentoNome,
    empreendimentoEndereco: g.empreendimentoEndereco,
    unidades: Array.from(g.unidades.values()),
  }));

  let logoDataUri: string | null = null;
  try {
    const brandPath = path.join(process.cwd(), "public", "logo-diminson.png");
    const buf = await readFile(brandPath);
    logoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
  }

  const totalAbertos = rows.length;
  const totalAlta = rows.filter((r) => r.prioridade === "alta").length;

  const data: ChecklistData = {
    funcionarioNome: func.nome,
    totalAbertos,
    totalAlta,
    grupos,
    geradoEmBR: formatDateTimeBR(new Date()),
    logoDataUri,
  };

  const html = renderChecklistHtml(data);

  const footerTemplate = `
    <style>
      .pdf-footer-inner {
        font-family: ui-sans-serif, system-ui, sans-serif;
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
      <span><strong>DiMinson Engenharia</strong> · Checklist · ${escapeHtml(func.nome)}</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>
  `;

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html, { footerTemplate });
  } catch (err) {
    console.error("[pdf-funcionario] render failed", err);
    return NextResponse.json(
      { error: "Falha ao gerar PDF" },
      { status: 500 },
    );
  }

  const sanitize = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_");
  const empSlug =
    grupos.length === 1 ? `-${sanitize(grupos[0].empreendimentoNome)}` : "";
  const filename = `checklist-${sanitize(func.nome)}${empSlug}-${hojeISO}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
