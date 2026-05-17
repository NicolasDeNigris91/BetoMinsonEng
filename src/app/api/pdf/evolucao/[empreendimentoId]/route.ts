import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, eq, gte, lte, sql } from "drizzle-orm";
import { differenceInCalendarDays } from "date-fns";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  fotos,
  unidades,
  vistorias,
} from "@/db/schema";
import { isLoggedIn } from "@/lib/auth";
import { isUuid } from "@/lib/route-params";
import { readFileBuffer } from "@/lib/storage";
import { formatDateBR, formatDateTimeBR, parseDateOnly } from "@/lib/format";
import { renderHtmlToPdf } from "@/lib/pdf";
import {
  renderEvolucaoHtml,
  type EvolucaoData,
  type EvolucaoFoto,
  type EvolucaoItem,
} from "@/components/pdf-evolucao-template";

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

function parseDateParam(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parseDateOnly(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ empreendimentoId: string }> },
) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { empreendimentoId } = await params;
  if (!isUuid(empreendimentoId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const inicio = parseDateParam(url.searchParams.get("inicio"));
  const fim = parseDateParam(url.searchParams.get("fim"));

  if (!inicio || !fim) {
    return NextResponse.json(
      { error: "Parametros 'inicio' e 'fim' (YYYY-MM-DD) sao obrigatorios" },
      { status: 400 },
    );
  }
  if (inicio > fim) {
    return NextResponse.json(
      { error: "Data de inicio nao pode ser depois da data de fim" },
      { status: 400 },
    );
  }

  // Fim inclui o dia inteiro (23:59:59).
  const fimInclusive = new Date(fim);
  fimInclusive.setHours(23, 59, 59, 999);

  const [[emp]] = await Promise.all([
    db
      .select()
      .from(empreendimentos)
      .where(eq(empreendimentos.id, empreendimentoId))
      .limit(1),
  ]);

  if (!emp) {
    return NextResponse.json(
      { error: "empreendimento não encontrado" },
      { status: 404 },
    );
  }

  // Eventos 'resolvido' criados dentro do periodo, com info do achado e da
  // vistoria de origem. Junta com unidades pra filtrar por empreendimento.
  const eventosResolvidos = await db
    .select({
      eventoId: achadoEventos.id,
      eventoCreatedAt: achadoEventos.createdAt,
      notaResolvido: achadoEventos.notaExtra,
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      achadoCreatedAt: achados.createdAt,
      vistoriaOrigemId: achados.vistoriaOrigemId,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
    })
    .from(achadoEventos)
    .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(
      and(
        eq(unidades.empreendimentoId, empreendimentoId),
        eq(achadoEventos.tipo, "resolvido"),
        gte(achadoEventos.createdAt, inicio),
        lte(achadoEventos.createdAt, fimInclusive),
      ),
    )
    .orderBy(asc(achadoEventos.createdAt));

  // Para cada achado resolvido, pega o evento 'criado' correspondente (sempre
  // existe — eh o evento na vistoria de origem). Pega tambem a primeira foto
  // do evento criado (antes) e a primeira do evento resolvido (depois).
  const achadoIds = eventosResolvidos.map((e) => e.achadoId);
  const eventoIds = eventosResolvidos.map((e) => e.eventoId);

  const [
    eventosCriados,
    fotosAntes,
    fotosDepois,
    [criadosNoPeriodo],
    [emAbertoHoje],
    vistoriasDataMap,
  ] = await Promise.all([
    achadoIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: achadoEventos.id,
            achadoId: achadoEventos.achadoId,
            vistoriaId: achadoEventos.vistoriaId,
          })
          .from(achadoEventos)
          .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
          .where(
            and(
              eq(achadoEventos.tipo, "criado"),
              sql`${achadoEventos.achadoId} IN (${sql.join(
                achadoIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
              eq(achados.vistoriaOrigemId, achadoEventos.vistoriaId),
            ),
          ),
    achadoIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            eventoId: fotos.achadoEventoId,
            arquivoPath: fotos.arquivoPath,
            thumbPath: fotos.thumbPath,
            legenda: fotos.legenda,
            ordem: fotos.ordem,
          })
          .from(fotos)
          .innerJoin(achadoEventos, eq(achadoEventos.id, fotos.achadoEventoId))
          .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
          .where(
            and(
              eq(achadoEventos.tipo, "criado"),
              sql`${achadoEventos.achadoId} IN (${sql.join(
                achadoIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
              eq(achados.vistoriaOrigemId, achadoEventos.vistoriaId),
            ),
          )
          .orderBy(asc(fotos.ordem)),
    eventoIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            eventoId: fotos.achadoEventoId,
            arquivoPath: fotos.arquivoPath,
            thumbPath: fotos.thumbPath,
            legenda: fotos.legenda,
            ordem: fotos.ordem,
          })
          .from(fotos)
          .where(
            sql`${fotos.achadoEventoId} IN (${sql.join(
              eventoIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
          .orderBy(asc(fotos.ordem)),
    db
      .select({ n: count() })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(
        and(
          eq(unidades.empreendimentoId, empreendimentoId),
          gte(achados.createdAt, inicio),
          lte(achados.createdAt, fimInclusive),
        ),
      ),
    db
      .select({ n: count() })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(
        and(
          eq(unidades.empreendimentoId, empreendimentoId),
          eq(achados.status, "aberto"),
        ),
      ),
    // Datas das vistorias de origem usadas pra mostrar "criado em DD/MM"
    // sem 2 round-trips depois.
    achadoIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: vistorias.id,
            data: vistorias.data,
            vistoriadorNome: vistorias.vistoriadorNome,
          })
          .from(vistorias)
          .where(
            sql`${vistorias.id} IN (${sql.join(
              eventosResolvidos.map((e) => sql`${e.vistoriaOrigemId}`),
              sql`, `,
            )})`,
          ),
  ]);

  // Primeira foto (menor ordem) do evento criado, por achado.
  const fotoAntesByAchado = new Map<string, EvolucaoFoto>();
  for (const f of fotosAntes) {
    // Achar achadoId via eventosCriados.
    const ec = eventosCriados.find((x) => x.id === f.eventoId);
    if (!ec) continue;
    if (fotoAntesByAchado.has(ec.achadoId)) continue;
    const dataUri = await fileToDataUri(f.thumbPath);
    if (dataUri) {
      fotoAntesByAchado.set(ec.achadoId, { dataUri, legenda: f.legenda });
    }
  }

  // Primeira foto do evento resolvido, por evento.
  const fotoDepoisByEvento = new Map<string, EvolucaoFoto>();
  for (const f of fotosDepois) {
    if (fotoDepoisByEvento.has(f.eventoId)) continue;
    const dataUri = await fileToDataUri(f.thumbPath);
    if (dataUri) {
      fotoDepoisByEvento.set(f.eventoId, { dataUri, legenda: f.legenda });
    }
  }

  const vistoriasMap = new Map(
    vistoriasDataMap.map((v) => [
      v.id,
      { data: v.data, vistoriadorNome: v.vistoriadorNome },
    ]),
  );

  const items: EvolucaoItem[] = eventosResolvidos.map((ev) => {
    const v = vistoriasMap.get(ev.vistoriaOrigemId);
    const dias = differenceInCalendarDays(ev.eventoCreatedAt, ev.achadoCreatedAt);
    return {
      achadoId: ev.achadoId,
      categoria: ev.categoria,
      local: ev.local,
      descricao: ev.descricao,
      unidadeNome: ev.unidadeNome,
      vistoriaOrigemDataBR: v?.data ? formatDateBR(v.data) : "—",
      resolvidoEmBR: formatDateBR(ev.eventoCreatedAt),
      dias: Math.max(0, dias),
      vistoriadorNome: v?.vistoriadorNome ?? null,
      notaResolvido: ev.notaResolvido,
      fotoAntes: fotoAntesByAchado.get(ev.achadoId) ?? null,
      fotoDepois: fotoDepoisByEvento.get(ev.eventoId) ?? null,
    };
  });

  // Mais recente primeiro (jornada inversa cronologica fica mais "como esta agora").
  items.sort((a, b) => b.resolvidoEmBR.localeCompare(a.resolvidoEmBR));

  const totalResolvidos = items.length;
  const totalCriados = Number(criadosNoPeriodo?.n ?? 0);
  const totalEmAbertoHoje = Number(emAbertoHoje?.n ?? 0);
  const saldoLiquido = totalResolvidos - totalCriados;
  const tempoMedioDias =
    totalResolvidos > 0
      ? items.reduce((acc, i) => acc + i.dias, 0) / totalResolvidos
      : null;

  // Logo: prefere o do empreendimento, cai pro brand da DiMinson.
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
      /* fallback to text */
    }
  }

  const data: EvolucaoData = {
    empreendimentoNome: emp.nome,
    empreendimentoCliente: emp.cliente,
    empreendimentoEndereco: emp.endereco,
    periodoInicioBR: formatDateBR(inicio),
    periodoFimBR: formatDateBR(fim),
    totalResolvidos,
    totalCriados,
    totalEmAbertoHoje,
    saldoLiquido,
    tempoMedioDias,
    items,
    geradoEmBR: formatDateTimeBR(new Date()),
    logoDataUri,
  };

  const html = renderEvolucaoHtml(data);

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdf(html);
  } catch (err) {
    console.error("[pdf-evolucao] render failed", err);
    return NextResponse.json(
      { error: "Falha ao gerar PDF" },
      { status: 500 },
    );
  }

  const sanitize = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_");
  const ini = inicio.toISOString().slice(0, 10);
  const f = fim.toISOString().slice(0, 10);
  const filename = `evolucao-${sanitize(emp.nome)}-${ini}-a-${f}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
