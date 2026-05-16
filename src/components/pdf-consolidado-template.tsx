import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { escapeHtml } from "./pdf-template";

export type ConsolidadoUnidadeAchado = {
  id: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  /** Texto pronto pra render: "atrasado 5d" / "vence amanhã" / "" */
  prazoTexto: string;
  prazoKind: "atrasado" | "hoje" | "proximo" | "futuro" | "none";
};

export type ConsolidadoUnidade = {
  id: string;
  nome: string;
  ultimaVistoriaBR: string | null;
  abertos: number;
  resolvidos: number;
  /** Map categoria -> quantos abertos. Quando 0, exibe "ok". */
  abertosPorCategoria: Record<Categoria, number>;
  achadosAbertos: ConsolidadoUnidadeAchado[];
};

export type ConsolidadoKpiCategoria = {
  categoria: Categoria;
  abertos: number;
  resolvidos: number;
  atrasados: number;
  /** Tempo medio de resolucao em dias (1 casa decimal). null = sem resolvidos. */
  tempoMedioDias: number | null;
};

export type ConsolidadoData = {
  empreendimentoNome: string;
  empreendimentoCliente: string | null;
  empreendimentoEndereco: string | null;
  totalUnidades: number;
  totalVistorias: number;
  totalAbertos: number;
  totalAtrasados: number;
  kpiPorCategoria: ConsolidadoKpiCategoria[];
  unidades: ConsolidadoUnidade[];
  geradoEmBR: string;
  logoDataUri: string | null;
};

const BRAND_TEXT = "DiMinson Engenharia";

const STRIPE_COLOR: Record<Categoria, string> = {
  ELE: "#facc15",
  HID: "#3b82f6",
  HVAC: "#0ea5e9",
  PISCINA: "#14b8a6",
  ASP: "#8b5cf6",
  SIS: "#64748b",
};

const BADGE: Record<Categoria, { bg: string; border: string; text: string }> = {
  ELE: { bg: "#fef9c3", border: "#fcd34d", text: "#713f12" },
  HID: { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  HVAC: { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
  PISCINA: { bg: "#ccfbf1", border: "#5eead4", text: "#134e4a" },
  ASP: { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  SIS: { bg: "#f1f5f9", border: "#cbd5e1", text: "#0f172a" },
};

// Ordem fixa pros chips ficarem consistentes entre unidades.
const ORDEM_CATEGORIA: Categoria[] = [
  "ELE",
  "HID",
  "HVAC",
  "PISCINA",
  "ASP",
  "SIS",
];

function prazoBadgeHtml(
  prazoTexto: string,
  prazoKind: ConsolidadoUnidadeAchado["prazoKind"],
): string {
  if (prazoKind === "none" || !prazoTexto) return "";
  const styles: Record<Exclude<typeof prazoKind, "none">, string> = {
    atrasado: "border-color:#fca5a5;color:#7f1d1d",
    hoje: "border-color:#fdba74;color:#7c2d12",
    proximo: "border-color:#fcd34d;color:#78350f",
    futuro: "border-color:#cbd5e1;color:#475569",
  };
  return `<span class="prazo-badge" style="${styles[prazoKind]}">${escapeHtml(prazoTexto)}</span>`;
}

function renderUnidade(u: ConsolidadoUnidade): string {
  const chipsHtml = ORDEM_CATEGORIA.filter(
    (c) => (u.abertosPorCategoria[c] ?? 0) > 0,
  )
    .map((cat) => {
      const n = u.abertosPorCategoria[cat] ?? 0;
      return `<span class="chip"><span class="chip-dot" style="background:${STRIPE_COLOR[cat]}"></span>${escapeHtml(CATEGORIA_LABELS[cat].toLowerCase())} <strong class="has">${String(n).padStart(2, "0")}</strong></span>`;
    })
    .join("");

  const achadosHtml = u.achadosAbertos
    .map((a) => {
      const b = BADGE[a.categoria];
      return `<li class="achado-inline">
        <div class="col-cat" style="color:${b.text}">${escapeHtml(CATEGORIA_LABELS[a.categoria])}</div>
        <div class="col-body">
          ${a.local ? `<span class="col-local">${escapeHtml(a.local)}</span><span class="col-desc"> — ${escapeHtml(a.descricao)}</span>` : `<span class="col-desc">${escapeHtml(a.descricao)}</span>`}
        </div>
        <div class="col-prazo">${prazoBadgeHtml(a.prazoTexto, a.prazoKind)}</div>
      </li>`;
    })
    .join("");

  const headerStatus =
    u.abertos === 0
      ? `<span style="color:#047857">${String(u.resolvidos).padStart(2, "0")} resolvidos · sem abertos</span>`
      : `<span class="accent">${String(u.abertos).padStart(2, "0")} em aberto</span> · ${String(u.resolvidos).padStart(2, "0")} resolvidos`;

  return `<div class="unidade-bloco">
    <div class="unidade-header">
      <p class="unidade-titulo">${escapeHtml(u.nome)}</p>
      <span class="unidade-meta">
        ${u.ultimaVistoriaBR ? `última vistoria <strong>${escapeHtml(u.ultimaVistoriaBR)}</strong> · ` : "sem vistorias · "}${headerStatus}
      </span>
    </div>
    ${chipsHtml ? `<div class="unidade-chips">${chipsHtml}</div>` : ""}
    ${achadosHtml ? `<ul class="unidade-achados">${achadosHtml}</ul>` : ""}
  </div>`;
}

function renderKpiRow(row: ConsolidadoKpiCategoria): string {
  const stripe = STRIPE_COLOR[row.categoria];
  return `<tr>
    <td><span class="cat-cell"><span class="dot" style="background:${stripe}"></span>${escapeHtml(CATEGORIA_LABELS[row.categoria])}</span></td>
    <td class="num">${String(row.abertos).padStart(2, "0")}</td>
    <td class="num">${String(row.resolvidos).padStart(2, "0")}</td>
    <td class="num"${row.atrasados > 0 ? ' style="color:#b91c1c;font-weight:700"' : ""}>${String(row.atrasados).padStart(2, "0")}</td>
    <td class="num">${row.tempoMedioDias != null ? `${row.tempoMedioDias.toFixed(1)} d` : "—"}</td>
  </tr>`;
}

export function renderConsolidadoHtml(data: ConsolidadoData): string {
  const eyebrowParts = [
    data.empreendimentoNome,
    data.empreendimentoCliente
      ? `Cliente ${data.empreendimentoCliente}`
      : null,
  ].filter(Boolean) as string[];

  const headerLogo = data.logoDataUri
    ? `<img src="${data.logoDataUri.replace(/"/g, "&quot;")}" alt="Logo" class="logo-img" />`
    : `<span class="brand-text">${BRAND_TEXT}</span>`;

  const unidadesHtml =
    data.unidades.length === 0
      ? `<p class="empty">Sem unidades cadastradas.</p>`
      : data.unidades.map(renderUnidade).join("");

  const kpiRowsHtml = data.kpiPorCategoria.length
    ? data.kpiPorCategoria.map(renderKpiRow).join("")
    : `<tr><td colspan="5" style="text-align:center;color:rgba(15,30,58,0.5);padding:16px">Sem achados registrados.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.empreendimentoNome)} — Relatório consolidado</title>
<style>${STYLE}</style>
</head>
<body>
<header class="pdf-header">
  <div class="header-left">
    <p class="eyebrow">${eyebrowParts.map(escapeHtml).join(" · ")}</p>
    <h1 class="page-title">Relatório consolidado</h1>
    <p class="meta">
      ${data.empreendimentoEndereco ? `<span>${escapeHtml(data.empreendimentoEndereco)}</span><span class="sep">·</span>` : ""}
      <span class="mono">${escapeHtml(data.geradoEmBR)}</span>
    </p>
  </div>
  <div class="header-right">
    ${headerLogo}
    <p class="tagline">VISTORIAS TÉCNICAS</p>
  </div>
</header>
<div class="header-divider"></div>

<div class="stat-row">
  <div class="stat">
    <p class="stat-label">Unidades</p>
    <p class="stat-value">${String(data.totalUnidades).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Vistorias</p>
    <p class="stat-value">${String(data.totalVistorias).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Em aberto</p>
    <p class="stat-value accent">${String(data.totalAbertos).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Atrasados</p>
    <p class="stat-value ${data.totalAtrasados > 0 ? "danger" : ""}">${String(data.totalAtrasados).padStart(2, "0")}</p>
  </div>
</div>

<h2 class="section-title">Achados por matéria</h2>
<table class="kpi-table">
  <thead>
    <tr>
      <th>Matéria</th>
      <th class="num">Abertos</th>
      <th class="num">Resolvidos</th>
      <th class="num">Atrasados</th>
      <th class="num">Tempo médio</th>
    </tr>
  </thead>
  <tbody>${kpiRowsHtml}</tbody>
</table>

<h2 class="section-title section-title-spaced">Panorama por unidade</h2>
${unidadesHtml}

<footer class="signature">
  <div class="signature-row">
    <span class="footer-brand">DiMinson Engenharia · Relatório consolidado</span>
    <span class="stamp">VST · ${new Date().getFullYear()}</span>
  </div>
  <p class="signed-by">Gerado em ${escapeHtml(data.geradoEmBR)}</p>
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

.mono, .stat-label, .stat-value, .eyebrow, .tagline, .stamp, .cat-badge,
.unidade-meta, .unidade-chips, .col-cat, .prazo-badge, .footer-brand, .signed-by {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
}

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
.meta .mono { font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }

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
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
.stat {
  background: #fff;
  border: 1px solid rgba(15,30,58,0.18);
  border-radius: 0;
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
  font-size: 26pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: #0f1e3a;
}
.stat-value.accent { color: #ff8000; }
.stat-value.danger { color: #dc2626; }

.section-title {
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.7);
  margin: 0 0 10px;
  font-family: 'Inter', sans-serif;
}
.section-title-spaced { margin-top: 18px; }

.kpi-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid rgba(15,30,58,0.18);
  border-radius: 0;
  overflow: hidden;
  margin-bottom: 8px;
  font-size: 9.5pt;
}
.kpi-table th {
  text-align: left;
  background: #0f1e3a;
  padding: 8px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  font-weight: 600;
  border-bottom: 1px solid rgba(15,30,58,0.12);
}
.kpi-table th.num, .kpi-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.kpi-table td {
  padding: 8px 12px;
  border-bottom: 1px dashed rgba(15,30,58,0.08);
}
.kpi-table tr:last-child td { border-bottom: none; }
.kpi-table .cat-cell { display: flex; align-items: center; gap: 8px; }
.kpi-table .cat-cell .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

.unidade-bloco {
  background: #fff;
  border: 1px solid rgba(15,30,58,0.18);
  border-top: 2px solid #0f1e3a;
  border-radius: 0;
  margin-bottom: 10px;
  overflow: hidden;
  page-break-inside: avoid;
  break-inside: avoid;
}
.unidade-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(15,30,58,0.18);
  background: #ffffff;
}
.unidade-titulo {
  font-size: 11pt;
  font-weight: 700;
  margin: 0;
}
.unidade-meta {
  font-size: 8pt;
  color: rgba(15,30,58,0.6);
  letter-spacing: 0.06em;
}
.unidade-meta strong { color: #0f1e3a; font-variant-numeric: tabular-nums; }
.unidade-meta .accent { color: #ff8000; }
.unidade-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 6px 14px;
  font-size: 8pt;
  color: rgba(15,30,58,0.6);
  border-bottom: 1px dashed rgba(15,30,58,0.12);
}
.unidade-chips .chip { display: inline-flex; align-items: center; gap: 4px; }
.unidade-chips .chip-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.unidade-chips .has { color: #b45309; font-weight: 700; }
.unidade-achados {
  list-style: none;
  margin: 0;
  padding: 6px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.achado-inline {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(15,30,58,0.08);
}
.achado-inline:last-child { border-bottom: none; }
.col-cat {
  flex-shrink: 0;
  width: 90px;
  font-size: 7.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-top: 1px;
}
.col-body { flex: 1; min-width: 0; }
.col-local { font-weight: 600; font-size: 9.5pt; }
.col-desc { color: rgba(15,30,58,0.75); font-size: 9.5pt; }
.col-prazo {
  flex-shrink: 0;
  text-align: right;
  width: 100px;
}
.prazo-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.empty {
  text-align: center;
  color: rgba(15,30,58,0.5);
  padding: 32px 8px;
  background: #fff;
  border: 1px dashed rgba(15,30,58,0.2);
  border-radius: 4px;
}

.signature {
  margin-top: 22px;
  page-break-inside: avoid;
}
.signature-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  padding-top: 12px;
  border-top: 1px dashed rgba(15,30,58,0.25);
}
.footer-brand {
  font-size: 7.5pt;
  color: rgba(15,30,58,0.55);
  letter-spacing: 0.12em;
  text-transform: uppercase;
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
  font-size: 8pt;
  color: rgba(15,30,58,0.55);
  letter-spacing: 0.04em;
}
`;
