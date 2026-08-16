import { describe, it, expect } from "vitest";
import { filtrarPorPapel, filtrarListaPorPapel, veFinanceiro } from "../../src/dominio/papel.js";

const veiculo = {
  codigo: "V-07", marca: "Honda", modelo: "City", placa: "ABC1D23",
  valorAnuncio: 9_700_000, cicloDias: 170,
  valorCompra: 8_400_000, custoTotal: 9_385_320, lucro: 314_680, retornoPct: 3.35,
};

describe("visão por papel (§5)", () => {
  it("master vê tudo, e o objeto volta intacto", () => {
    expect(veFinanceiro("master")).toBe(true);
    expect(filtrarPorPapel(veiculo, "master")).toBe(veiculo);
  });

  it("vendedor não vê compra, custo nem margem", () => {
    const visto = filtrarPorPapel(veiculo, "vendedor") as Record<string, unknown>;
    for (const oculto of ["valorCompra", "custoTotal", "lucro", "retornoPct"]) {
      expect(visto).not.toHaveProperty(oculto);
    }
  });

  it("vendedor continua vendo o que precisa para negociar", () => {
    const visto = filtrarPorPapel(veiculo, "vendedor") as Record<string, unknown>;
    expect(visto["codigo"]).toBe("V-07");
    expect(visto["placa"]).toBe("ABC1D23");
    expect(visto["valorAnuncio"]).toBe(9_700_000);   // o preço pedido é dele
    expect(visto["cicloDias"]).toBe(170);
  });

  it("o filtro não altera o original", () => {
    filtrarPorPapel(veiculo, "vendedor");
    expect(veiculo.valorCompra).toBe(8_400_000);
  });

  it("vale para lista inteira", () => {
    const lista = filtrarListaPorPapel([veiculo, veiculo], "vendedor");
    expect(lista).toHaveLength(2);
    expect(lista[0]).not.toHaveProperty("lucro");
  });
});
