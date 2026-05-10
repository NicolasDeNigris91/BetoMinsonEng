import {
  CATEGORIA_LABELS,
  type Categoria,
  type EventoTipo,
} from "@/db/schema";

export type PdfFoto = {
  dataUri: string;
  legenda: string | null;
};

export type PdfRow = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  evento: {
    id: string;
    tipo: EventoTipo;
    notaExtra: string | null;
    fotos: PdfFoto[];
  };
};

export type PdfData = {
  empreendimentoNome: string;
  empreendimentoCliente: string | null;
  empreendimentoEndereco: string | null;
  unidadeNome: string;
  vistoriaDataBR: string;
  vistoriadorNome: string | null;
  observacoesGerais: string | null;
  rows: PdfRow[];
  finalizadaEmBR: string | null;
  geradoEmBR: string;
  logoDataUri: string | null;
};

const BRAND_TEXT = "DiMinson Engenharia";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
}

function eventoBadge(tipo: EventoTipo): string | null {
  switch (tipo) {
    case "criado":
      return null;
    case "persiste":
      return "PERSISTE";
    case "resolvido":
      return "RESOLVIDO";
    case "nota":
      return "ANOTAÇÃO";
  }
}

function renderRow(row: PdfRow): string {
  const badge = eventoBadge(row.evento.tipo);
  const meta = (row.local || badge)
    ? `<div class="row-meta">${
        row.local ? `<span class="local">${escapeHtml(row.local)}</span>` : ""
      }${
        badge
          ? `<span class="badge badge-${row.evento.tipo}">${badge}</span>`
          : ""
      }</div>`
    : "";

  const nota = row.evento.notaExtra
    ? `<p class="nota-extra"><em>Atualização:</em> ${escapeHtml(row.evento.notaExtra)}</p>`
    : "";

  const fotosHtml = row.evento.fotos.length
    ? `<div class="fotos-grid">${row.evento.fotos
        .map(
          (f) => `<figure class="foto">
            <img src="${escapeAttr(f.dataUri)}" alt="${escapeAttr(f.legenda ?? "")}" />
            ${f.legenda ? `<figcaption>${escapeHtml(f.legenda)}</figcaption>` : ""}
          </figure>`,
        )
        .join("")}</div>`
    : "";

  return `<tr>
    <td class="col-materia cat">${row.categoria}</td>
    <td class="col-descricao">
      ${meta}
      <p class="descricao">${escapeHtml(row.descricao)}</p>
      ${nota}
      ${fotosHtml}
    </td>
  </tr>`;
}

export function renderPdfHtml(data: PdfData): string {
  const subtitleParts = Array.from(
    new Set(data.rows.map((r) => CATEGORIA_LABELS[r.categoria].toUpperCase())),
  );

  const headerRight = data.logoDataUri
    ? `<img src="${escapeAttr(data.logoDataUri)}" alt="Logo" class="logo-img" />`
    : `<div class="brand">
        <span class="brand-text">${BRAND_TEXT}</span>
        <div class="brand-mark"></div>
      </div>`;

  const rowsHtml =
    data.rows.length === 0
      ? `<tr><td colspan="2" class="empty">Nenhum achado registrado nesta vistoria.</td></tr>`
      : data.rows.map(renderRow).join("");

  const obsHtml = data.observacoesGerais
    ? `<section class="obs">
        <h3>Observações gerais</h3>
        <p>${escapeHtml(data.observacoesGerais)}</p>
      </section>`
    : "";

  const signatureLine = data.vistoriadorNome
    ? `Assinado por: ${escapeHtml(data.vistoriadorNome)}`
    : "Assinado";

  const dateLine = data.finalizadaEmBR
    ? ` — ${escapeHtml(data.finalizadaEmBR)}`
    : ` — gerado em ${escapeHtml(data.geradoEmBR)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.empreendimentoNome)} — ${escapeHtml(data.unidadeNome)} — ${escapeHtml(data.vistoriaDataBR)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="pdf-header">
  <div class="header-left">
    <div class="title">
      <strong>${escapeHtml(data.empreendimentoNome)}</strong> | VISTORIA DE INSTALAÇÕES
    </div>
    <div class="subtitle">
      <span>MATÉRIAS: ${subtitleParts.join("/") || "—"}</span>
      <span>DATA: ${escapeHtml(data.vistoriaDataBR)}</span>
    </div>
  </div>
  <div class="header-right">${headerRight}</div>
</header>
<div class="unidade-banner">${escapeHtml(data.unidadeNome)}</div>
<table class="rows-table">
  <thead>
    <tr>
      <th class="col-materia">MATÉRIA</th>
      <th class="col-descricao">DESCRIÇÃO</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
${obsHtml}
<footer class="signature">
  <div class="line"></div>
  <p class="signed-by">${signatureLine}${dateLine}</p>
</footer>
</body>
</html>`;
}

const STYLE = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10pt;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
    line-height: 1.45;
  }
  .pdf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 6px;
  }
  .header-left .title { font-size: 12pt; letter-spacing: 0.02em; }
  .header-left .title strong { font-weight: 700; }
  .header-left .subtitle {
    font-size: 8pt; color: #444; margin-top: 4px;
    display: flex; gap: 20px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .header-right { text-align: right; }
  .header-right .logo-img { max-height: 38px; max-width: 160px; object-fit: contain; }
  .header-right .brand {
    display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
  }
  .header-right .brand-text { font-weight: 700; font-size: 13pt; letter-spacing: -0.01em; }
  .header-right .brand-mark {
    width: 60px; height: 4px;
    background: linear-gradient(90deg, #f59e0b 0%, #f59e0b 30%, transparent 30%, transparent 35%, #f59e0b 35%, #f59e0b 65%, transparent 65%, transparent 70%, #f59e0b 70%, #f59e0b 100%);
    border-radius: 2px;
  }
  .unidade-banner {
    background: #e5e5e5; text-align: center; font-weight: 700;
    padding: 6px 0; font-size: 11pt;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #1a1a1a;
  }
  .rows-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .rows-table thead { display: table-header-group; }
  .rows-table thead th {
    background: #f0f0f0; text-align: left;
    font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 6px 8px; border-bottom: 1px solid #1a1a1a;
  }
  .rows-table th.col-materia, .rows-table td.col-materia {
    width: 64px; text-align: center;
  }
  .rows-table td {
    border-bottom: 1px solid #d4d4d4;
    padding: 8px; vertical-align: top;
  }
  .rows-table td.cat {
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, monospace;
    font-size: 10pt; color: #444; text-align: center;
  }
  .rows-table tr { page-break-inside: avoid; break-inside: avoid; }
  .row-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 4px; }
  .local { font-weight: 600; }
  .badge {
    display: inline-block; font-size: 7.5pt; padding: 1px 6px; border-radius: 999px;
    border: 1px solid #999; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
  }
  .badge-resolvido { background: #d1fadf; border-color: #16a34a; color: #166534; }
  .badge-persiste { background: #fef3c7; border-color: #d97706; color: #92400e; }
  .badge-nota { background: #e0e7ff; border-color: #6366f1; color: #3730a3; }
  .descricao { margin: 0; white-space: pre-wrap; }
  .nota-extra {
    margin: 6px 0 0; padding-left: 8px; border-left: 2px solid #ccc;
    font-size: 9.5pt; color: #444; white-space: pre-wrap;
  }
  .fotos-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .fotos-grid .foto {
    margin: 0; width: calc(33.33% - 4px);
    page-break-inside: avoid; break-inside: avoid;
  }
  .fotos-grid .foto img {
    width: 100%; height: auto; border-radius: 4px;
    border: 1px solid #ddd; display: block;
  }
  .fotos-grid .foto figcaption {
    font-size: 8pt; color: #555; margin-top: 2px; line-height: 1.2;
  }
  .empty { text-align: center; color: #888; padding: 32px 8px; }
  .obs {
    margin-top: 16px; padding: 10px;
    background: #f9f9f9; border-left: 3px solid #999;
  }
  .obs h3 {
    margin: 0 0 4px; font-size: 9.5pt;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .obs p { margin: 0; white-space: pre-wrap; font-size: 9.5pt; }
  .signature { margin-top: 24px; page-break-inside: avoid; }
  .signature .line { border-top: 1px solid #999; width: 40%; margin-top: 16px; }
  .signature .signed-by { font-size: 8.5pt; color: #444; margin-top: 4px; }
`;
