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
};

export type PdfStats = {
  achados: number;
  abertos: number;
  resolvidos: number;
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
  stats: PdfStats;
  finalizadaEmBR: string | null;
  geradoEmBR: string;
  logoDataUri: string | null;
};

const BRAND_TEXT = "DiMinson Engenharia";

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

// Cores semanticas por categoria — espelham CATEGORIA_STRIPE_BORDER do app.
const STRIPE_COLOR: Record<Categoria, string> = {
  ELE: "#facc15",
  HID: "#3b82f6",
  HVAC: "#0ea5e9",
  PISCINA: "#14b8a6",
  ASP: "#8b5cf6",
  SIS: "#64748b",
};

const DOT_COLOR: Record<Categoria, string> = {
  ELE: "#facc15",
  HID: "#3b82f6",
  HVAC: "#0ea5e9",
  PISCINA: "#14b8a6",
  ASP: "#8b5cf6",
  SIS: "#64748b",
};

// Badge pastel por categoria (mesma logica do CATEGORIA_BADGE_CLASS).
const BADGE: Record<Categoria, { bg: string; border: string; text: string }> = {
  ELE: { bg: "#fef9c3", border: "#fcd34d", text: "#713f12" },
  HID: { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  HVAC: { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
  PISCINA: { bg: "#ccfbf1", border: "#5eead4", text: "#134e4a" },
  ASP: { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  SIS: { bg: "#f1f5f9", border: "#cbd5e1", text: "#0f172a" },
};

function eventoBadge(tipo: EventoTipo): { label: string; bg: string; border: string; text: string } | null {
  switch (tipo) {
    case "criado":
      return null;
    case "persiste":
      return {
        label: "PERSISTE",
        bg: "#fef3c7",
        border: "#fcd34d",
        text: "#78350f",
      };
    case "resolvido":
      return {
        label: "RESOLVIDO",
        bg: "#d1fae5",
        border: "#6ee7b7",
        text: "#064e3b",
      };
    case "nota":
      return {
        label: "ANOTAÇÃO",
        bg: "#e0e7ff",
        border: "#a5b4fc",
        text: "#312e81",
      };
  }
}

function tipoTextLabel(tipo: EventoTipo): string {
  switch (tipo) {
    case "criado":
      return "achado criado";
    case "persiste":
      return "persiste";
    case "resolvido":
      return "resolvido";
    case "nota":
      return "anotação";
  }
}

function tipoTextColor(tipo: EventoTipo): string {
  switch (tipo) {
    case "criado":
      return "#b45309";
    case "persiste":
      return "#b45309";
    case "resolvido":
      return "#047857";
    case "nota":
      return "#64748b";
  }
}

function renderAchado(row: PdfRow, vistoriadorNome: string | null): string {
  const stripe = STRIPE_COLOR[row.categoria];
  const dot = DOT_COLOR[row.categoria];
  const badge = BADGE[row.categoria];
  const evBadge = eventoBadge(row.evento.tipo);

  const headerInner = `
    <span class="cat-badge" style="background:${badge.bg};border-color:${badge.border};color:${badge.text}">
      ${escapeHtml(CATEGORIA_LABELS[row.categoria])}
    </span>
    ${row.local ? `<span class="local">${escapeHtml(row.local)}</span>` : ""}
    ${
      evBadge
        ? `<span class="evento-badge" style="background:${evBadge.bg};border-color:${evBadge.border};color:${evBadge.text}">${evBadge.label}</span>`
        : ""
    }
  `;

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

  const autorPart = vistoriadorNome
    ? ` · ${escapeHtml(vistoriadorNome)}`
    : "";

  return `<li class="achado" style="border-left-color:${stripe}">
    <div class="achado-header">${headerInner}</div>
    <p class="descricao">${escapeHtml(row.descricao)}</p>
    ${nota}
    <p class="audit">
      <span class="dot" style="background:${dot}"></span>
      <span class="categoria-lower">${escapeHtml(CATEGORIA_LABELS[row.categoria].toLowerCase())}</span>
      <span class="tipo" style="color:${tipoTextColor(row.evento.tipo)}">${tipoTextLabel(row.evento.tipo)}</span>
      <span class="sep">·</span>
      <span class="data">${escapeHtml(row.evento.createdAtBR)}</span>${autorPart}
    </p>
    ${fotosHtml}
  </li>`;
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

  const achadosHtml =
    data.rows.length === 0
      ? `<li class="empty">Nenhum achado registrado nesta vistoria.</li>`
      : data.rows.map((row) => renderAchado(row, data.vistoriadorNome)).join("");

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

  const stamp = `VST · ${new Date().getFullYear()}`;

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
  </div>
  <div class="header-right">
    ${headerLogo}
    <p class="tagline">VISTORIAS · INSPEÇÕES TÉCNICAS</p>
  </div>
</header>

<div class="header-divider"></div>

<div class="stat-row">
  <div class="stat">
    <p class="stat-label">Achados</p>
    <p class="stat-value">${String(data.stats.achados).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Em aberto</p>
    <p class="stat-value accent">${String(data.stats.abertos).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Resolvidos</p>
    <p class="stat-value">${String(data.stats.resolvidos).padStart(2, "0")}</p>
  </div>
</div>

<h2 class="section-title section-title-spaced">Achados desta vistoria</h2>
<ul class="achados">${achadosHtml}</ul>

${obsHtml}

<footer class="signature">
  <div class="signature-row">
    <div class="signature-line"></div>
    <span class="stamp">${stamp}</span>
  </div>
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
  background:
    linear-gradient(rgba(15,30,58,0.025) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(90deg, rgba(15,30,58,0.025) 1px, transparent 1px) 0 0 / 24px 24px,
    #fbfcfe;
}

.mono, .audit, .stat-label, .stat-value, .eyebrow, .tagline, .stamp, .cat-badge, .evento-badge {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
}

/* ============ HEADER ============ */

.pdf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding-bottom: 12px;
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
}

.tagline {
  margin: 0;
  font-size: 7pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.55);
}

.header-divider {
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, #ff8000 50%, transparent 100%);
  opacity: 0.7;
  margin-bottom: 16px;
}

/* ============ STAT ROW ============ */

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}

.stat {
  background: #ffffff;
  border: 1px solid rgba(15,30,58,0.18);
  border-radius: 4px;
  padding: 10px 12px;
}

.stat-label {
  margin: 0;
  font-size: 8pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.55);
  font-weight: 500;
}

.stat-value {
  margin: 2px 0 0;
  font-size: 22pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: #0f1e3a;
}

.stat-value.accent { color: #ff8000; }

/* ============ SECTIONS ============ */

.section-title {
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.7);
  margin: 0 0 10px;
  font-family: 'Inter', sans-serif;
}

.section-title-spaced { margin-top: 4px; }

/* ============ ACHADOS LIST ============ */

.achados {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.achado {
  background: #ffffff;
  border: 1px solid rgba(15,30,58,0.18);
  border-left: 3px solid #888;
  border-radius: 4px;
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

.cat-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid;
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
  border-radius: 4px;
  border: 1px solid;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.descricao {
  margin: 0;
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
  font-size: 8pt;
  color: rgba(15,30,58,0.6);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.audit .dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.audit .categoria-lower { color: rgba(15,30,58,0.7); }

.audit .tipo {
  font-weight: 700;
}

.audit .sep { color: rgba(15,30,58,0.35); }

.audit .data {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.empty {
  text-align: center;
  color: rgba(15,30,58,0.5);
  padding: 32px 8px;
  background: #ffffff;
  border: 1px dashed rgba(15,30,58,0.2);
  border-radius: 4px;
  list-style: none;
}

.fotos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.fotos-grid .foto {
  margin: 0;
  width: calc(33.33% - 4px);
  page-break-inside: avoid;
  break-inside: avoid;
}

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
}

.obs .section-title { margin: 0 0 6px; }

.obs p {
  margin: 0;
  white-space: pre-wrap;
  font-size: 10pt;
}

/* ============ SIGNATURE ============ */

.signature {
  margin-top: 28px;
  page-break-inside: avoid;
}

.signature-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 4px;
}

.signature-line {
  border-top: 1px dashed rgba(15,30,58,0.4);
  width: 40%;
  height: 16px;
}

.stamp {
  display: inline-block;
  padding: 2px 6px;
  border: 1px solid rgba(15,30,58,0.3);
  border-radius: 2px;
  font-size: 7pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.55);
}

.signed-by {
  margin: 0;
  font-size: 8.5pt;
  color: rgba(15,30,58,0.6);
  letter-spacing: 0.04em;
}
`;
