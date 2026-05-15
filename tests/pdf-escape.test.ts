import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/components/pdf-template";

describe("escapeHtml (PDF template)", () => {
  it("escapa <script> em descrição maliciosa", () => {
    const out = escapeHtml('<script>alert("xss")</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapa aspas duplas e simples", () => {
    expect(escapeHtml('"single \' double"')).toBe(
      "&quot;single &#39; double&quot;",
    );
  });

  it("escapa & sem dupla-escapar entidades existentes (ordem importa)", () => {
    // O input '&amp;' contém um '&' literal — deve virar &amp;amp;.
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("preserva texto sem caracteres especiais", () => {
    expect(escapeHtml("Trinca no teto da sala 305")).toBe(
      "Trinca no teto da sala 305",
    );
  });

  it("preserva acentos (não escapa caracteres não-HTML)", () => {
    expect(escapeHtml("Áção çãoã")).toBe("Áção çãoã");
  });
});
