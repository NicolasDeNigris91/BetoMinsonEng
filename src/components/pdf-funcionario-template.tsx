import { CATEGORIA_LABELS, type Categoria } from "@/db/schema";

export type ChecklistItem = {
  achadoId: string;
  categoria: Categoria;
  local: string | null;
  descricao: string;
  prioridade: "alta" | "media" | null;
  prazoEmBR: string | null;
  prazoVencido: boolean;
};

export type ChecklistUnidade = {
  unidadeNome: string;
  itens: ChecklistItem[];
};

export type ChecklistGrupo = {
  empreendimentoNome: string;
  empreendimentoEndereco: string | null;
  unidades: ChecklistUnidade[];
};

export type ChecklistData = {
  funcionarioNome: string;
  totalAbertos: number;
  totalAlta: number;
  grupos: ChecklistGrupo[];
  geradoEmBR: string;
  logoDataUri: string | null;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CAT_COLORS: Record<Categoria, string> = {
  ELE: "#a16207",
  HID: "#1d4ed8",
  HVAC: "#0f766e",
  PISCINA: "#0369a1",
  ASP: "#b45309",
  SIS: "#6d28d9",
};

function renderItem(it: ChecklistItem): string {
  const catColor = CAT_COLORS[it.categoria];
  const catLabel = escapeHtml(CATEGORIA_LABELS[it.categoria]);
  const local = it.local ? escapeHtml(it.local) : "";
  const desc = escapeHtml(it.descricao);
  const prioBadge =
    it.prioridade === "alta"
      ? `<span class="prio prio-alta">▲ ALTA</span>`
      : it.prioridade === "media"
        ? `<span class="prio prio-media">● MÉDIA</span>`
        : "";
  const prazoBadge = it.prazoEmBR
    ? `<span class="prazo ${it.prazoVencido ? "prazo-vencido" : ""}">${it.prazoVencido ? "VENCEU " : "PRAZO "}${escapeHtml(it.prazoEmBR)}</span>`
    : "";
  return `
    <tr>
      <td class="check-cell"><span class="check-box"></span></td>
      <td class="body-cell">
        <div class="line-head">
          <span class="cat-badge" style="background:${catColor}1a;color:${catColor};border-color:${catColor}66;">${catLabel}</span>
          ${prioBadge}
          ${local ? `<span class="local">${local}</span>` : ""}
          ${prazoBadge}
        </div>
        <div class="desc">${desc}</div>
      </td>
    </tr>
  `;
}

function renderUnidade(u: ChecklistUnidade): string {
  return `
    <div class="unidade">
      <div class="unidade-label">${escapeHtml(u.unidadeNome)} · ${u.itens.length} ${u.itens.length === 1 ? "achado" : "achados"}</div>
      <table class="lista">
        ${u.itens.map(renderItem).join("")}
      </table>
    </div>
  `;
}

function renderGrupo(g: ChecklistGrupo): string {
  const total = g.unidades.reduce((s, u) => s + u.itens.length, 0);
  const endereco = g.empreendimentoEndereco
    ? `<div class="emp-endereco">${escapeHtml(g.empreendimentoEndereco)}</div>`
    : "";
  return `
    <section class="grupo">
      <header class="grupo-head">
        <div>
          <div class="emp-nome">${escapeHtml(g.empreendimentoNome)}</div>
          ${endereco}
        </div>
        <div class="grupo-count">${total} ${total === 1 ? "achado" : "achados"}</div>
      </header>
      ${g.unidades.map(renderUnidade).join("")}
    </section>
  `;
}

export function renderChecklistHtml(data: ChecklistData): string {
  const logoBlock = data.logoDataUri
    ? `<img src="${data.logoDataUri}" alt="" class="logo" />`
    : `<div class="brand-text">DiMinson Engenharia</div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Checklist · ${escapeHtml(data.funcionarioNome)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 11px;
    color: #0f1e3a;
    line-height: 1.4;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #0f1e3a;
    padding-bottom: 8px;
    margin-bottom: 14px;
  }
  .logo { height: 28px; }
  .brand-text { font-weight: 700; font-size: 13px; letter-spacing: 0.02em; }
  .doc-title {
    text-align: right;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #64748b;
  }
  .doc-title strong {
    display: block;
    color: #0f1e3a;
    font-size: 14px;
    letter-spacing: -0.01em;
    text-transform: none;
    margin-top: 2px;
  }
  .summary {
    display: flex;
    gap: 18px;
    padding: 8px 12px;
    background: #f1f5f9;
    border-left: 3px solid #ff8a4c;
    margin-bottom: 16px;
    border-radius: 4px;
    font-size: 11px;
  }
  .summary b { font-size: 13px; font-weight: 700; }
  .summary .sep { color: #94a3b8; }
  .grupo { margin-bottom: 18px; break-inside: avoid-page; }
  .grupo-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
    margin-bottom: 6px;
  }
  .emp-nome {
    font-weight: 700;
    font-size: 12.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .emp-endereco {
    font-size: 9.5px;
    color: #64748b;
    margin-top: 1px;
  }
  .grupo-count {
    font-size: 10px;
    color: #64748b;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .unidade { margin-top: 6px; break-inside: avoid; }
  .unidade-label {
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #475569;
    padding: 3px 0;
    border-bottom: 1px dashed #e2e8f0;
    margin-bottom: 2px;
  }
  table.lista { width: 100%; border-collapse: collapse; }
  table.lista tr { break-inside: avoid; }
  td.check-cell { width: 18px; padding: 6px 0 6px 0; vertical-align: top; }
  .check-box {
    display: inline-block;
    width: 11px;
    height: 11px;
    border: 1.4px solid #475569;
    border-radius: 2px;
    margin-top: 1px;
  }
  td.body-cell {
    padding: 6px 0 6px 4px;
    border-bottom: 1px solid #f1f5f9;
  }
  tr:last-child td.body-cell { border-bottom: 0; }
  .line-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .cat-badge {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid;
    font-weight: 600;
  }
  .prio {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 8.5px;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid;
    font-weight: 700;
  }
  .prio-alta { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
  .prio-media { background: #fffbeb; color: #b45309; border-color: #fde68a; }
  .local { font-weight: 600; }
  .desc { color: #334155; margin-top: 1px; font-size: 10.5px; }
  .prazo {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 8.5px;
    letter-spacing: 0.06em;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid #cbd5e1;
    color: #475569;
    background: #f8fafc;
  }
  .prazo-vencido { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
  .empty {
    margin-top: 40px;
    text-align: center;
    color: #64748b;
    font-size: 12px;
  }
</style>
</head>
<body>
  <div class="header">
    ${logoBlock}
    <div class="doc-title">
      Checklist de campo
      <strong>${escapeHtml(data.funcionarioNome)}</strong>
    </div>
  </div>

  <div class="summary">
    <span><b>${data.totalAbertos}</b> ${data.totalAbertos === 1 ? "achado pendente" : "achados pendentes"}</span>
    ${data.totalAlta > 0 ? `<span class="sep">·</span><span><b>${data.totalAlta}</b> de prioridade alta</span>` : ""}
    <span class="sep">·</span>
    <span>Gerado em ${escapeHtml(data.geradoEmBR)}</span>
  </div>

  ${
    data.grupos.length === 0
      ? `<p class="empty">Nada pendente.</p>`
      : data.grupos.map(renderGrupo).join("")
  }
</body>
</html>`;
}
