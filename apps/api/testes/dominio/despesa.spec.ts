import { describe, it, expect } from "vitest";
import { statusDaData } from "../../src/dominio/despesa.js";

describe("status da despesa vem da data (§ decisão de 16/09/2026)", () => {
  it("data de hoje é pago", () => {
    expect(statusDaData("2026-09-16", "2026-09-16")).toBe("pago");
  });

  it("data no passado é pago", () => {
    expect(statusDaData("2026-09-01", "2026-09-16")).toBe("pago");
  });

  it("data no futuro é previsto", () => {
    expect(statusDaData("2026-10-01", "2026-09-16")).toBe("previsto");
  });
});
