import { describe, it, expect } from "vitest";
import { passwordMatches } from "@/lib/auth";

// APP_PASSWORD vem do tests/setup.ts: "test-password-123"

describe("passwordMatches", () => {
  it("aceita a senha correta", () => {
    expect(passwordMatches("test-password-123")).toBe(true);
  });

  it("rejeita senha errada de mesmo tamanho", () => {
    expect(passwordMatches("xxxx-password-xyz")).toBe(false);
  });

  it("rejeita senha mais curta sem comparar (early return)", () => {
    // Não deve lançar — apenas retornar false. timingSafeEqual lançaria
    // RangeError se chamado com buffers de tamanhos diferentes; o early
    // return em passwordMatches existe pra evitar isso (e tambem evita
    // vazar tamanho via exception path).
    expect(passwordMatches("curto")).toBe(false);
  });

  it("rejeita senha mais longa", () => {
    expect(passwordMatches("test-password-123-extra-chars")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(passwordMatches("")).toBe(false);
  });

  it("é case-sensitive", () => {
    expect(passwordMatches("TEST-PASSWORD-123")).toBe(false);
  });
});
