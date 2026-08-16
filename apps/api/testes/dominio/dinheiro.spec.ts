import { describe, it, expect } from "vitest";
import { deNumeric, paraNumeric, reais, brl, ratear } from "../../src/dominio/dinheiro.js";

describe("conversão de numeric(12,2)", () => {
  it("lê a string do Postgres sem passar por float", () => {
    expect(deNumeric("93853.20")).toBe(9_385_320);
    expect(deNumeric("369.46")).toBe(36_946);
    expect(deNumeric("0.10")).toBe(10);
    expect(deNumeric("-1000.00")).toBe(-100_000);
    expect(deNumeric(null)).toBeNull();
  });

  it("os valores que o float erraria", () => {
    // 0.1 + 0.2 !== 0.3 em ponto flutuante. Em centavos, sempre.
    expect(deNumeric("0.10")! + deNumeric("0.20")!).toBe(deNumeric("0.30"));
    expect(deNumeric("188.10")! + deNumeric("263.34")!).toBe(deNumeric("451.44"));
  });

  it("volta para o formato que o Postgres aceita", () => {
    expect(paraNumeric(9_385_320)).toBe("93853.20");
    expect(paraNumeric(-100_000)).toBe("-1000.00");
    expect(paraNumeric(5)).toBe("0.05");
  });

  it("ida e volta não perde nada", () => {
    for (const v of ["0.01", "4447.54", "661467.24", "-59074.76"]) {
      expect(paraNumeric(deNumeric(v)!)).toBe(v);
    }
  });

  it("recusa valor que não é inteiro de centavos", () => {
    expect(() => paraNumeric(1.5)).toThrow();
  });
});

describe("formatação", () => {
  it("usa o padrão brasileiro", () => {
    expect(reais(9_385_320)).toBe("93.853,20");
    expect(brl(36_624_946)).toBe("R$ 366.249,46");
    expect(reais(5)).toBe("0,05");
    expect(reais(-100_000)).toBe("-1.000,00");
  });
});

describe("rateio", () => {
  it("o caso real: 369,46 de tráfego pago em três carros", () => {
    const partes = ratear(36_946, 3);
    expect(partes).toEqual([12_316, 12_315, 12_315]);
    // a soma tem de bater com o que saiu da conta, ao centavo
    expect(partes.reduce((a, b) => a + b, 0)).toBe(36_946);
  });

  it("nunca perde nem inventa centavo, para qualquer divisão", () => {
    for (const total of [1, 7, 100, 36_946, 999_999]) {
      for (const n of [1, 2, 3, 5, 7, 11]) {
        expect(ratear(total, n).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("divisão exata não sobra nada", () => {
    expect(ratear(30_000, 3)).toEqual([10_000, 10_000, 10_000]);
  });

  it("recusa rateio sem destino", () => {
    expect(() => ratear(100, 0)).toThrow();
  });
});
