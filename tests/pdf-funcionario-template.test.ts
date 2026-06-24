import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderChecklistHtml,
  type ChecklistData,
} from "@/components/pdf-funcionario-template";

const baseData: ChecklistData = {
  funcionarioNome: "Beto Silva",
  totalAbertos: 0,
  totalAlta: 0,
  grupos: [],
  geradoEmBR: "23/06/2026 14:32",
  logoDataUri: null,
};

describe("escapeHtml (PDF funcionario)", () => {
  it("escapa <script> em nome malicioso", () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapa aspas e &", () => {
    expect(escapeHtml('a & "b"')).toBe("a &amp; &quot;b&quot;");
  });
});

describe("renderChecklistHtml", () => {
  it("mostra estado vazio quando não há grupos", () => {
    const html = renderChecklistHtml(baseData);
    expect(html).toContain("Nada pendente");
    expect(html).toContain("Beto Silva");
  });

  it("renderiza grupos e itens com badges de prioridade e prazo vencido", () => {
    const html = renderChecklistHtml({
      ...baseData,
      totalAbertos: 2,
      totalAlta: 1,
      grupos: [
        {
          empreendimentoNome: "Residencial Parque Verde",
          empreendimentoEndereco: "Rua X, 100",
          unidades: [
            {
              unidadeNome: "Apt 302",
              itens: [
                {
                  achadoId: "a1",
                  categoria: "HID",
                  local: "Banheiro",
                  descricao: "Infiltração no teto",
                  prioridade: "alta",
                  prazoEmBR: "20/06/2026",
                  prazoVencido: true,
                },
                {
                  achadoId: "a2",
                  categoria: "ELE",
                  local: null,
                  descricao: "Tomada solta",
                  prioridade: null,
                  prazoEmBR: null,
                  prazoVencido: false,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(html).toContain("Residencial Parque Verde");
    expect(html).toContain("Rua X, 100");
    expect(html).toContain("Apt 302");
    expect(html).toContain("Infiltração no teto");
    expect(html).toContain("Tomada solta");
    expect(html).toContain("▲ ALTA");
    expect(html).toContain("VENCEU 20/06/2026");
  });

  it("escapa input malicioso no nome do funcionário", () => {
    const html = renderChecklistHtml({
      ...baseData,
      funcionarioNome: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("inclui logo quando dataUri é passado", () => {
    const html = renderChecklistHtml({
      ...baseData,
      logoDataUri: "data:image/png;base64,AAA",
    });
    expect(html).toContain('src="data:image/png;base64,AAA"');
  });

  it("usa fallback de texto quando logo é nulo", () => {
    const html = renderChecklistHtml(baseData);
    expect(html).toContain("DiMinson Engenharia");
  });
});
