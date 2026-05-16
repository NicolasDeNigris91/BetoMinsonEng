import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";
import { escapeHtml } from "./pdf-template";

export type EvolucaoFoto = {
  dataUri: string;
  legenda: string | null;
};

export type EvolucaoItem = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  unidadeNome: string;
  vistoriaOrigemDataBR: string;
  resolvidoEmBR: string;
  dias: number;
  vistoriadorNome: string | null;
  notaResolvido: string | null;
  fotoAntes: EvolucaoFoto | null;
  fotoDepois: EvolucaoFoto | null;
};

export type EvolucaoData = {
  empreendimentoNome: string;
  empreendimentoCliente: string | null;
  empreendimentoEndereco: string | null;
  periodoInicioBR: string;
  periodoFimBR: string;
  /** Total de achados resolvidos no periodo. */
  totalResolvidos: number;
  /** Achados criados no periodo (entradas). */
  totalCriados: number;
  /** Achados ainda em aberto hoje (saida do periodo). */
  totalEmAbertoHoje: number;
  /** Saldo = resolvidos - criados. Positivo significa reducao no estoque. */
  saldoLiquido: number;
  /** Tempo medio de resolucao em dias dos itens do periodo (1 casa). null se vazio. */
  tempoMedioDias: number | null;
  items: EvolucaoItem[];
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

const BADGE: Record<Categoria, { border: string; text: string }> = {
  ELE: { border: "#fcd34d", text: "#713f12" },
  HID: { border: "#93c5fd", text: "#1e3a8a" },
  HVAC: { border: "#7dd3fc", text: "#0c4a6e" },
  PISCINA: { border: "#5eead4", text: "#134e4a" },
  ASP: { border: "#c4b5fd", text: "#4c1d95" },
  SIS: { border: "#cbd5e1", text: "#0f172a" },
};

function fotoSlot(foto: EvolucaoFoto | null, kind: "antes" | "depois"): string {
  if (!foto) {
    const placeholderColor = kind === "antes" ? "#fee2e2" : "#d1fae5";
    return `<div class="photo-empty" style="background:${placeholderColor}">
      <span>Sem foto</span>
    </div>`;
  }
  return `<img src="${foto.dataUri.replace(/"/g, "&quot;")}" alt="${escapeHtml(foto.legenda ?? `Foto ${kind}`)}" class="photo" />`;
}

function renderItem(item: EvolucaoItem): string {
  const stripe = STRIPE_COLOR[item.categoria];
  const badge = BADGE[item.categoria];
  const diasTxt = item.dias === 1 ? "1 dia" : `${item.dias} dias`;

  const localLine = item.local
    ? `${escapeHtml(item.unidadeNome)} · ${escapeHtml(item.local)}`
    : escapeHtml(item.unidadeNome);

  const notaHtml = item.notaResolvido
    ? `<p class="compare-summary"><strong>Resolução:</strong> ${escapeHtml(item.notaResolvido)}</p>`
    : "";

  return `<li class="compare-item" style="border-left-color:${stripe}">
    <div class="compare-header">
      <span class="cat-badge" style="border-color:${badge.border};color:${badge.text}">
        ${escapeHtml(CATEGORIA_LABELS[item.categoria])}
      </span>
      <span class="local">${localLine}</span>
    </div>
    <p class="descricao">${escapeHtml(item.descricao)}</p>
    <div class="compare-grid">
      <div class="compare-side">
        ${fotoSlot(item.fotoAntes, "antes")}
        <div class="caption before">CRIADO</div>
        <div class="date">${escapeHtml(item.vistoriaOrigemDataBR)}${item.vistoriadorNome ? ` · ${escapeHtml(item.vistoriadorNome)}` : ""}</div>
      </div>
      <div class="compare-arrow">→</div>
      <div class="compare-side">
        ${fotoSlot(item.fotoDepois, "depois")}
        <div class="caption after">RESOLVIDO · ${diasTxt}</div>
        <div class="date">${escapeHtml(item.resolvidoEmBR)}</div>
      </div>
    </div>
    ${notaHtml}
  </li>`;
}

export function renderEvolucaoHtml(data: EvolucaoData): string {
  const eyebrowParts = [
    data.empreendimentoNome,
    data.empreendimentoCliente
      ? `Cliente ${data.empreendimentoCliente}`
      : null,
  ].filter(Boolean) as string[];

  const headerLogo = data.logoDataUri
    ? `<img src="${data.logoDataUri.replace(/"/g, "&quot;")}" alt="Logo" class="logo-img" />`
    : `<span class="brand-text">${BRAND_TEXT}</span>`;

  const itemsHtml =
    data.items.length === 0
      ? `<p class="empty">Nenhum achado foi resolvido no período selecionado.</p>`
      : data.items.map(renderItem).join("");

  // Indicador do saldo: ↓ se positivo (reduziu o estoque), ↑ se negativo,
  // = se neutro. Pinta verde quando reduziu, vermelho quando piorou.
  const saldo = data.saldoLiquido;
  const saldoCor = saldo > 0 ? "#047857" : saldo < 0 ? "#b91c1c" : "#475569";
  const saldoIcon = saldo > 0 ? "↓" : saldo < 0 ? "↑" : "=";
  const saldoLabel =
    saldo > 0 ? "redução líquida" : saldo < 0 ? "aumento líquido" : "neutro";
  const saldoVal = `${saldoIcon} ${Math.abs(saldo)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.empreendimentoNome)} — Evolução ${escapeHtml(data.periodoInicioBR)} a ${escapeHtml(data.periodoFimBR)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="pdf-header">
  <div class="header-left">
    <p class="eyebrow">${eyebrowParts.map(escapeHtml).join(" · ")}</p>
    <h1 class="page-title">Evolução do empreendimento</h1>
    <p class="meta">
      <span>Período</span>
      <span class="sep">·</span>
      <span class="mono">${escapeHtml(data.periodoInicioBR)} → ${escapeHtml(data.periodoFimBR)}</span>
    </p>
  </div>
  <div class="header-right">
    ${headerLogo}
    <p class="tagline">VISTORIAS TÉCNICAS</p>
  </div>
</header>
<div class="header-divider"></div>

<div class="periodo-banner">
  <div>
    <h3>${data.totalResolvidos} ${data.totalResolvidos === 1 ? "achado resolvido" : "achados resolvidos"}</h3>
    <p>tempo médio · <strong>${data.tempoMedioDias != null ? `${data.tempoMedioDias.toFixed(1)} dias` : "—"}</strong></p>
  </div>
  <div class="right">
    <p class="delta-label">${saldoLabel}</p>
    <p class="delta" style="color:${saldoCor}">${saldoVal}</p>
  </div>
</div>

<div class="stat-row">
  <div class="stat">
    <p class="stat-label">Criados</p>
    <p class="stat-value">${String(data.totalCriados).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Resolvidos</p>
    <p class="stat-value success">${String(data.totalResolvidos).padStart(2, "0")}</p>
  </div>
  <div class="stat">
    <p class="stat-label">Em aberto hoje</p>
    <p class="stat-value accent">${String(data.totalEmAbertoHoje).padStart(2, "0")}</p>
  </div>
</div>

<h2 class="section-title">Antes / Depois</h2>
<ul class="compare-list">${itemsHtml}</ul>

<footer class="signature">
  <div class="signature-row">
    <span class="footer-brand">DiMinson Engenharia · Relatório de evolução</span>
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
.compare-side .caption, .compare-side .date, .footer-brand, .signed-by,
.periodo-banner .delta, .periodo-banner .delta-label, .periodo-banner p {
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

.periodo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid rgba(15,30,58,0.18);
  border-top: 2px solid #0f1e3a;
  border-radius: 0;
  margin-bottom: 16px;
}
.periodo-banner h3 {
  margin: 0 0 2px;
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-family: 'Inter', sans-serif;
}
.periodo-banner p {
  margin: 0;
  font-size: 8.5pt;
  color: rgba(15,30,58,0.6);
  letter-spacing: 0.06em;
}
.periodo-banner p strong { color: #0f1e3a; }
.periodo-banner .right { text-align: right; }
.periodo-banner .delta {
  font-size: 32pt;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  margin: 0;
}
.periodo-banner .delta-label {
  font-size: 8pt;
  color: rgba(15,30,58,0.6);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
  font-size: 28pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.stat-value.accent { color: #ff8000; }
.stat-value.success { color: #047857; }

.section-title {
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.7);
  margin: 0 0 10px;
  font-family: 'Inter', sans-serif;
}

.compare-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.compare-item {
  background: #fff;
  border: 1px solid rgba(15,30,58,0.18);
  border-left: 4px solid #888;
  border-radius: 0;
  padding: 12px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.compare-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
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
.local { font-weight: 600; font-size: 10pt; }
.descricao { margin: 0 0 8px; font-size: 10pt; white-space: pre-wrap; }

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 18px 1fr;
  gap: 8px;
  align-items: flex-start;
}
.compare-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.compare-side .photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid rgba(15,30,58,0.2);
  display: block;
}
.compare-side .photo-empty {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 3px;
  border: 1px dashed rgba(15,30,58,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.5);
}
.compare-side .caption {
  font-size: 7.5pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.compare-side .caption.before { color: #b45309; font-weight: 700; }
.compare-side .caption.after { color: #047857; font-weight: 700; }
.compare-side .date {
  font-size: 7.5pt;
  color: rgba(15,30,58,0.55);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.compare-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 28%;
  color: #047857;
  font-size: 20pt;
  font-weight: 800;
}
.compare-summary {
  margin: 8px 0 0;
  font-size: 9pt;
  color: rgba(15,30,58,0.7);
  padding-top: 6px;
  border-top: 1px dashed rgba(15,30,58,0.12);
}
.compare-summary strong { color: #0f1e3a; }

.empty {
  text-align: center;
  color: rgba(15,30,58,0.5);
  padding: 40px 8px;
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
