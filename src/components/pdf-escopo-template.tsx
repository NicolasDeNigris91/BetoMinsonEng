import {
  CATEGORIA_LABELS,
  type Categoria,
} from "@/db/schema";
import { escapeHtml } from "./pdf-template";

export type PdfEscopoFoto = {
  dataUri: string;
  legenda: string | null;
};

export type PdfEscopoAchado = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  prazoEmBR: string | null;
  status: "aberto" | "resolvido";
  fotos: PdfEscopoFoto[];
};

export type PdfEscopoUnidade = {
  unidadeId: string;
  unidadeNome: string;
  achados: PdfEscopoAchado[];
};

export type PdfEscopoData = {
  empreendimentoNome: string;
  empreendimentoCliente: string | null;
  empreendimentoEndereco: string | null;
  escopoNome: string;
  escopoDescricao: string | null;
  unidades: PdfEscopoUnidade[];
  totalAchados: number;
  geradoEmBR: string;
  logoDataUri: string | null;
};

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

function renderAchado(achado: PdfEscopoAchado, numero: number): string {
  const stripe = STRIPE_COLOR[achado.categoria];
  const badge = BADGE[achado.categoria];
  const nFotos = achado.fotos.length;

  const fotosClass =
    nFotos === 1
      ? "fotos-grid qtd-1"
      : nFotos === 2
        ? "fotos-grid qtd-2"
        : "fotos-grid qtd-3";

  const fotosHtml = nFotos
    ? `<div class="${fotosClass}">${achado.fotos
        .map(
          (f) => `<figure class="foto">
            <img src="${escapeAttr(f.dataUri)}" alt="${escapeAttr(f.legenda ?? "Foto do achado")}" />
            ${f.legenda ? `<figcaption>${escapeHtml(f.legenda)}</figcaption>` : ""}
          </figure>`,
        )
        .join("")}</div>`
    : "";

  const prazoHtml = achado.prazoEmBR
    ? `<span class="prazo">Prazo: ${escapeHtml(achado.prazoEmBR)}</span>`
    : "";

  const statusHtml =
    achado.status === "resolvido"
      ? `<span class="status-resolvido">RESOLVIDO</span>`
      : "";

  return `<li class="achado" style="border-left-color:${stripe}">
    <div class="achado-header">
      <span class="achado-num">${String(numero).padStart(2, "0")}</span>
      <span class="cat-badge" style="border-color:${badge.border};color:${badge.text}">
        ${escapeHtml(CATEGORIA_LABELS[achado.categoria])}
      </span>
      ${achado.local ? `<span class="local">${escapeHtml(achado.local)}</span>` : ""}
      ${statusHtml}
      ${prazoHtml}
    </div>
    <p class="descricao">${escapeHtml(achado.descricao)}</p>
    ${fotosHtml}
  </li>`;
}

export function renderEscopoPdfHtml(data: PdfEscopoData): string {
  const eyebrow = [
    data.empreendimentoNome,
    data.empreendimentoCliente ? `Cliente ${data.empreendimentoCliente}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const headerLogo = data.logoDataUri
    ? `<img src="${escapeAttr(data.logoDataUri)}" alt="Logo" class="logo-img" />`
    : `<span class="brand-text">DiMinson Engenharia</span>`;

  let counter = 0;
  const unidadesHtml = data.unidades
    .map((un) => {
      const achadosHtml = un.achados
        .map((a) => {
          counter += 1;
          return renderAchado(a, counter);
        })
        .join("");
      return `
        <section class="unidade-section">
          <div class="unidade-header">
            <h3 class="unidade-nome">${escapeHtml(un.unidadeNome)}</h3>
            <span class="unidade-count">${un.achados.length} ${
              un.achados.length === 1 ? "achado" : "achados"
            }</span>
          </div>
          <ul class="achados">${achadosHtml}</ul>
        </section>
      `;
    })
    .join("");

  const descricaoHtml = data.escopoDescricao
    ? `<p class="escopo-descricao">${escapeHtml(data.escopoDescricao)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.empreendimentoNome)} — ${escapeHtml(data.escopoNome)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="pdf-header">
  <div class="header-left">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h1 class="page-title">Ordem de serviço</h1>
    <p class="escopo-nome">${escapeHtml(data.escopoNome)}</p>
    ${descricaoHtml}
    <p class="counts">
      <span class="mono">${String(data.totalAchados).padStart(2, "0")} ${
        data.totalAchados === 1 ? "achado" : "achados"
      }</span>
      <span class="sep">·</span>
      <span class="mono">${String(data.unidades.length).padStart(2, "0")} ${
        data.unidades.length === 1 ? "unidade" : "unidades"
      }</span>
    </p>
  </div>
  <div class="header-right">
    ${headerLogo}
    <p class="tagline">ORDEM DE SERVIÇO</p>
  </div>
</header>

<div class="header-divider"></div>

${
  data.totalAchados === 0
    ? `<p class="empty">Nenhum achado neste escopo.</p>`
    : unidadesHtml
}

<footer class="signature">
  <p class="signed-by">Gerado em ${escapeHtml(data.geradoEmBR)} · ${escapeHtml(data.empreendimentoNome)}</p>
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

.mono, .achado-num, .cat-badge, .eyebrow, .tagline, .counts, .unidade-count,
.prazo, .status-resolvido {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

/* HEADER */

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
  margin: 2px 0 6px;
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.05;
}

.escopo-nome {
  margin: 0 0 4px;
  font-size: 14pt;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.escopo-descricao {
  margin: 0 0 6px;
  font-size: 10pt;
  color: rgba(15,30,58,0.75);
  white-space: pre-line;
}

.counts {
  margin: 4px 0 0;
  font-size: 9pt;
  color: rgba(15,30,58,0.6);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.counts .sep { color: rgba(15,30,58,0.35); }

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

/* UNIDADES */

.unidade-section {
  margin-bottom: 20px;
  page-break-inside: avoid;
}

.unidade-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(15,30,58,0.2);
  margin-bottom: 8px;
}

.unidade-nome {
  margin: 0;
  font-size: 11pt;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.unidade-count {
  font-size: 8pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.55);
}

/* ACHADOS */

.achados {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.achado {
  border-left: 3px solid #ccc;
  border-top: 1px solid rgba(15,30,58,0.08);
  border-right: 1px solid rgba(15,30,58,0.08);
  border-bottom: 1px solid rgba(15,30,58,0.08);
  border-radius: 0 6px 6px 0;
  padding: 8px 10px;
  page-break-inside: avoid;
}

.achado-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.achado-num {
  font-size: 9pt;
  font-weight: 700;
  color: rgba(15,30,58,0.5);
  letter-spacing: 0.02em;
}

.cat-badge {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.local {
  font-size: 10pt;
  font-weight: 600;
}

.prazo {
  font-size: 8pt;
  color: #92400e;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  background: #fef3c7;
  border-radius: 4px;
}

.status-resolvido {
  font-size: 8pt;
  color: #065f46;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  border-radius: 999px;
  font-weight: 600;
}

.descricao {
  margin: 4px 0;
  font-size: 10pt;
  line-height: 1.45;
  white-space: pre-line;
}

/* FOTOS */

.fotos-grid {
  display: grid;
  gap: 6px;
  margin-top: 6px;
}

.fotos-grid.qtd-1 { grid-template-columns: 1fr; max-width: 50%; }
.fotos-grid.qtd-2 { grid-template-columns: 1fr 1fr; max-width: 70%; }
.fotos-grid.qtd-3 { grid-template-columns: repeat(3, 1fr); }

.foto { margin: 0; }
.foto img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid rgba(15,30,58,0.1);
}
.foto figcaption {
  font-size: 8pt;
  color: rgba(15,30,58,0.6);
  margin-top: 2px;
  font-style: italic;
}

/* FOOTER */

.signature {
  margin-top: 24px;
  padding-top: 8px;
  border-top: 1px dashed rgba(15,30,58,0.2);
}

.signed-by {
  margin: 0;
  font-size: 8pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(15,30,58,0.5);
  text-align: center;
}

.empty {
  text-align: center;
  font-size: 11pt;
  color: rgba(15,30,58,0.5);
  padding: 40px 0;
}

@page {
  size: A4;
  margin: 18mm 14mm 20mm 14mm;
}
`;
