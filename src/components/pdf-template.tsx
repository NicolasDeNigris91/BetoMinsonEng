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
    createdAtBR: string;
    notaExtra: string | null;
    fotos: PdfFoto[];
  };
  funcionarioOrigemNome?: string | null;
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
  protocolo: string;
  isRascunho: boolean;
};

const BRAND_TEXT = "DiMinson Engenharia";

const ORDEM_CATEGORIA: Categoria[] = [
  "ELE",
  "HID",
  "HVAC",
  "PISCINA",
  "ASP",
  "SIS",
];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const STRIPE_COLOR: Record<Categoria, string> = {
  ELE: "#facc15",
  HID: "#3b82f6",
  HVAC: "#0ea5e9",
  PISCINA: "#14b8a6",
  ASP: "#8b5cf6",
  SIS: "#64748b",
};

const BADGE: Record<Categoria, { border: string; text: string }> = {
  ELE: { border: "#fcd34d", text: "#713f12" },
  HID: { border: "#93c5fd", text: "#1e3a8a" },
  HVAC: { border: "#7dd3fc", text: "#0c4a6e" },
  PISCINA: { border: "#5eead4", text: "#134e4a" },
  ASP: { border: "#c4b5fd", text: "#4c1d95" },
  SIS: { border: "#cbd5e1", text: "#0f172a" },
};

function eventoBadge(tipo: EventoTipo): { label: string; border: string; text: string } | null {
  switch (tipo) {
    case "criado":
      return null;
    case "persiste":
      return { label: "PERSISTE", border: "#fcd34d", text: "#78350f" };
    case "resolvido":
      return { label: "RESOLVIDO", border: "#6ee7b7", text: "#064e3b" };
    case "nota":
      return { label: "ANOTAÇÃO", border: "#a5b4fc", text: "#312e81" };
  }
}

function renderAchado(
  row: PdfRow,
  numero: number,
  vistoriadorNome: string | null,
): string {
  const stripe = STRIPE_COLOR[row.categoria];
  const badge = BADGE[row.categoria];
  const evBadge = eventoBadge(row.evento.tipo);
  const nFotos = row.evento.fotos.length;

  const headerInner = `
    <span class="achado-num">${String(numero).padStart(2, "0")}</span>
    <span class="cat-badge" style="border-color:${badge.border};color:${badge.text}">
      ${escapeHtml(CATEGORIA_LABELS[row.categoria])}
    </span>
    ${row.local ? `<span class="local">${escapeHtml(row.local)}</span>` : ""}
    ${
      evBadge
        ? `<span class="evento-badge" style="border-color:${evBadge.border};color:${evBadge.text}">${evBadge.label}</span>`
        : ""
    }
  `;

  const nota = row.evento.notaExtra
    ? `<p class="nota-extra"><em>Atualização:</em> ${escapeHtml(row.evento.notaExtra)}</p>`
    : "";

  const fotosClass =
    nFotos === 1
      ? "fotos-grid qtd-1"
      : nFotos === 2
        ? "fotos-grid qtd-2"
        : "fotos-grid qtd-3";

  const fotosHtml = nFotos
    ? `<div class="${fotosClass}">${row.evento.fotos
        .map(
          (f) => `<figure class="foto">
            <img src="${escapeAttr(f.dataUri)}" alt="${escapeAttr(f.legenda ?? "Foto do achado")}" />
            ${f.legenda ? `<figcaption>${escapeHtml(f.legenda)}</figcaption>` : ""}
          </figure>`,
        )
        .join("")}</div>`
    : "";

  const autorLabel = row.funcionarioOrigemNome
    ? `via funcionário: ${escapeHtml(row.funcionarioOrigemNome)}`
    : vistoriadorNome
      ? escapeHtml(vistoriadorNome)
      : null;
  const autorPart = autorLabel
    ? ` <span class="sep">·</span> <span class="autor">${autorLabel}</span>`
    : "";
  const fotosBadge =
    nFotos > 0
      ? ` <span class="sep">·</span> <span class="photos-count">${nFotos} ${nFotos === 1 ? "foto" : "fotos"}</span>`
      : "";

  return `<li class="achado" style="border-left-color:${stripe}">
    <div class="achado-header">${headerInner}</div>
    <p class="descricao">${escapeHtml(row.descricao)}</p>
    ${nota}
    <p class="audit">
      <span class="data">${escapeHtml(row.evento.createdAtBR)}</span>${autorPart}${fotosBadge}
    </p>
    ${fotosHtml}
  </li>`;
}

function groupByCategoria(rows: PdfRow[]): { categoria: Categoria; rows: PdfRow[] }[] {
  const map = new Map<Categoria, PdfRow[]>();
  for (const row of rows) {
    const arr = map.get(row.categoria) ?? [];
    arr.push(row);
    map.set(row.categoria, arr);
  }
  return ORDEM_CATEGORIA.filter((c) => map.has(c)).map((c) => ({
    categoria: c,
    rows: map.get(c)!,
  }));
}

export function renderPdfHtml(data: PdfData): string {
  const eyebrowParts = [
    data.empreendimentoNome,
    data.empreendimentoCliente
      ? `Cliente ${data.empreendimentoCliente}`
      : null,
  ].filter(Boolean) as string[];

  const headerLogo = data.logoDataUri
    ? `<img src="${escapeAttr(data.logoDataUri)}" alt="Logo" class="logo-img" />`
    : `<span class="brand-text">${BRAND_TEXT}</span>`;

  let counter = 0;
  const grupos = groupByCategoria(data.rows);
  const gruposHtml = grupos
    .map((g) => {
      const sectionClass = `section-materia mat-${g.categoria}`;
      const dotColor = STRIPE_COLOR[g.categoria];
      const achadosHtml = g.rows
        .map((row) => {
          counter += 1;
          return renderAchado(row, counter, data.vistoriadorNome);
        })
        .join("");
      return `
        <div class="${sectionClass}">
          <span class="materia-dot" style="background:${dotColor}"></span>
          <h3 class="materia-nome">${escapeHtml(CATEGORIA_LABELS[g.categoria])}</h3>
          <span class="materia-count">${g.rows.length} ${g.rows.length === 1 ? "achado" : "achados"}</span>
        </div>
        <ul class="achados">${achadosHtml}</ul>
      `;
    })
    .join("");

  const conteudoHtml =
    data.rows.length === 0
      ? `<p class="empty">Nenhum achado registrado nesta vistoria.</p>`
      : gruposHtml;

  const obsHtml = data.observacoesGerais
    ? `<section class="obs">
        <h3 class="section-title">Observações gerais</h3>
        <p>${escapeHtml(data.observacoesGerais)}</p>
      </section>`
    : "";

  const signatureLine = data.vistoriadorNome
    ? `Assinado por ${escapeHtml(data.vistoriadorNome)}`
    : "Assinado";

  const dateLine = data.finalizadaEmBR
    ? ` · ${escapeHtml(data.finalizadaEmBR)}`
    : ` · gerado em ${escapeHtml(data.geradoEmBR)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.empreendimentoNome)} — ${escapeHtml(data.unidadeNome)} — ${escapeHtml(data.vistoriaDataBR)}</title>
<style>${STYLE}</style>
</head>
<body class="${data.isRascunho ? "draft" : ""}">
<header class="pdf-header">
  <div class="header-left">
    <p class="eyebrow">${eyebrowParts.map(escapeHtml).join(" · ")}</p>
    <h1 class="page-title">Vistoria de instalações</h1>
    <p class="meta">
      <span>${escapeHtml(data.unidadeNome)}</span>
      <span class="sep">·</span>
      <span class="mono">${escapeHtml(data.vistoriaDataBR)}</span>
      ${
        data.vistoriadorNome
          ? `<span class="sep">·</span><span>${escapeHtml(data.vistoriadorNome)}</span>`
          : ""
      }
    </p>
    <p class="protocolo">${escapeHtml(data.protocolo)}</p>
  </div>
  <div class="header-right">
    ${headerLogo}
    <p class="tagline">VISTORIAS TÉCNICAS</p>
  </div>
</header>

<div class="header-divider"></div>

${conteudoHtml}

${obsHtml}

<footer class="signature">
  <p class="signed-by">${signatureLine}${dateLine}</p>
</footer>
</body>
</html>`;
}

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 10pt;
  color: #0f1e3a;
  margin: 0;
  padding: 0;
  line-height: 1.5;
  background: #ffffff;
}

/* Watermark RASCUNHO — fixed permite que apareca em cada pagina impressa.
 * Chromium repete elementos position:fixed em cada folha do PDF. */
body.draft::before {
  content: 'RASCUNHO';
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-family: 'JetBrains Mono', monospace;
  font-size: 130pt;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: rgba(220, 38, 38, 0.08);
  z-index: 0;
  pointer-events: none;
  white-space: nowrap;
}

.mono, .audit, .eyebrow, .tagline, .cat-badge, .evento-badge, .achado-num,
.protocolo, .materia-count {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
}

/* ============ HEADER ============ */

.pdf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding-bottom: 12px;
  position: relative;
  z-index: 1;
}

.header-left { flex: 1; min-width: 0; }

.eyebrow {
  margin: 0;
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.55);
  font-weight: 500;
}

.page-title {
  margin: 2px 0 4px;
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.05;
}

.meta {
  margin: 0;
  font-size: 10pt;
  color: rgba(15,30,58,0.7);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.meta .sep { color: rgba(15,30,58,0.35); }

.meta .mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.protocolo {
  margin: 4px 0 0;
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(15, 30, 58, 0.5);
}

.header-right {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.header-right .logo-img {
  max-height: 36px;
  max-width: 160px;
  object-fit: contain;
}

.header-right .brand-text {
  font-weight: 700;
  font-size: 13pt;
  letter-spacing: -0.015em;
  border-bottom: 2px solid #ff8000;
  padding-bottom: 2px;
}

.tagline {
  margin: 0;
  font-size: 7pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.55);
}

.header-divider {
  height: 1px;
  background: #0f1e3a;
  margin-bottom: 16px;
  position: relative;
  z-index: 1;
}

/* ============ SECTION POR MATERIA ============ */

.section-materia {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 2px solid;
  position: relative;
  z-index: 1;
  page-break-after: avoid;
  break-after: avoid;
}
.section-materia.mat-ELE { border-color: #facc15; }
.section-materia.mat-HID { border-color: #3b82f6; }
.section-materia.mat-HVAC { border-color: #0ea5e9; }
.section-materia.mat-PISCINA { border-color: #14b8a6; }
.section-materia.mat-ASP { border-color: #8b5cf6; }
.section-materia.mat-SIS { border-color: #64748b; }

.materia-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.materia-nome {
  margin: 0;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: -0.01em;
  flex: 1;
  font-family: 'Inter', sans-serif;
}

.materia-count {
  font-size: 9pt;
  color: rgba(15, 30, 58, 0.55);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ============ ACHADOS ============ */

.achados {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.achado {
  background: #ffffff;
  border: 1px solid rgba(15,30,58,0.18);
  border-left: 4px solid #888;
  border-radius: 0;
  padding: 10px 12px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.achado-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.achado-num {
  color: #0f1e3a;
  font-size: 14pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  margin-right: 2px;
}

.cat-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 2px;
  border: 1px solid;
  background: transparent;
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.local {
  font-weight: 600;
  font-size: 10pt;
}

.evento-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid;
  background: transparent;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.descricao {
  margin: 4px 0 6px;
  white-space: pre-wrap;
  font-size: 10pt;
}

.nota-extra {
  margin: 6px 0 0;
  padding-left: 8px;
  border-left: 2px solid rgba(15,30,58,0.2);
  font-size: 9.5pt;
  color: rgba(15,30,58,0.7);
  font-style: italic;
  white-space: pre-wrap;
}

.audit {
  margin: 8px 0 0;
  font-size: 8.5pt;
  color: rgba(15,30,58,0.6);
}

.audit .sep { color: rgba(15,30,58,0.3); margin: 0 2px; }
.audit .data {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  color: rgba(15, 30, 58, 0.75);
}
.audit .autor { color: rgba(15, 30, 58, 0.75); }
.audit .photos-count {
  color: rgba(15, 30, 58, 0.7);
  font-weight: 600;
}

.empty {
  text-align: center;
  color: rgba(15,30,58,0.5);
  padding: 32px 8px;
  background: #ffffff;
  border: 1px dashed rgba(15,30,58,0.2);
  border-radius: 4px;
  position: relative;
  z-index: 1;
}

/* ============ FOTOS — LAYOUT ADAPTATIVO ============ */

.fotos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.fotos-grid .foto {
  margin: 0;
  page-break-inside: avoid;
  break-inside: avoid;
}

/* 1 foto = 60% pra nao ficar gigante. 2 fotos = lado a lado (50/50).
 * 3+ fotos = 3 por linha (33% cada). */
.fotos-grid.qtd-1 .foto { width: 60%; }
.fotos-grid.qtd-2 .foto { width: calc(50% - 3px); }
.fotos-grid.qtd-3 .foto { width: calc(33.33% - 4px); }

.fotos-grid .foto img {
  width: 100%;
  height: auto;
  border-radius: 4px;
  border: 1px solid rgba(15,30,58,0.2);
  display: block;
}

.fotos-grid .foto figcaption {
  font-size: 8pt;
  color: rgba(15,30,58,0.6);
  margin-top: 2px;
  line-height: 1.3;
}

/* ============ OBSERVACOES ============ */

.obs {
  margin-top: 18px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid rgba(15,30,58,0.18);
  border-left: 3px solid #ff8000;
  border-radius: 4px;
  position: relative;
  z-index: 1;
}

.section-title {
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.7);
  margin: 0 0 10px;
  font-family: 'Inter', sans-serif;
}

.obs .section-title { margin: 0 0 6px; }

.obs p {
  margin: 0;
  white-space: pre-wrap;
  font-size: 10pt;
}

/* ============ SIGNATURE ============ */

.signature {
  margin-top: 22px;
  padding-top: 10px;
  border-top: 1px dashed rgba(15,30,58,0.25);
  position: relative;
  z-index: 1;
  page-break-inside: avoid;
}

.signed-by {
  margin: 0;
  font-size: 8.5pt;
  color: rgba(15,30,58,0.6);
  letter-spacing: 0.04em;
  text-align: right;
}
`;
