import { describe, it, expect } from "vitest";
import {
  algumFiltroAtivo, lerFiltros, naFaixa, noPeriodo, passaNosFiltros,
  precoDeReferencia, SEM_FILTRO,
} from "../../src/dominio/filtros.js";

const HOJE = "2026-08-09";

const carro = (extra: Partial<Parameters<typeof precoDeReferencia>[0]> = {}) => ({
  marca: "Honda", dataCompra: "2026-02-14", dataVenda: null,
  valorCompra: 8_400_000, valorVenda: null, valorAnuncio: null, ...extra,
});

describe("preço de referência", () => {
  it("vendido responde pela venda", () => {
    expect(precoDeReferencia(carro({ valorVenda: 9_700_000, valorAnuncio: 9_000_000 })))
      .toBe(9_700_000);
  });

  it("em estoque, pelo anúncio", () => {
    expect(precoDeReferencia(carro({ valorAnuncio: 9_000_000 }))).toBe(9_000_000);
  });

  it("sem anúncio, pelo que se pagou", () => {
    expect(precoDeReferencia(carro())).toBe(8_400_000);
  });
});

describe("faixa de preço (§6.1)", () => {
  it("os cortes são 60 mil e 100 mil", () => {
    expect(naFaixa(carro({ valorCompra: 5_999_999 }), "a")).toBe(true);
    expect(naFaixa(carro({ valorCompra: 6_000_000 }), "a")).toBe(false);
    expect(naFaixa(carro({ valorCompra: 6_000_000 }), "b")).toBe(true);
    expect(naFaixa(carro({ valorCompra: 10_000_000 }), "b")).toBe(true);
    expect(naFaixa(carro({ valorCompra: 10_000_001 }), "b")).toBe(false);
    expect(naFaixa(carro({ valorCompra: 10_000_001 }), "c")).toBe(true);
  });

  it("sem faixa, passa tudo", () => {
    expect(naFaixa(carro({ valorCompra: 1 }), null)).toBe(true);
  });
});

describe("período (§6.1)", () => {
  it("carro no pátio conta da compra", () => {
    expect(noPeriodo(carro({ dataCompra: "2026-07-20" }), 30, HOJE)).toBe(true);
    expect(noPeriodo(carro({ dataCompra: "2026-06-20" }), 30, HOJE)).toBe(false);
  });

  it("carro vendido conta da venda, não da compra", () => {
    const antigo = carro({ dataCompra: "2025-01-01", dataVenda: "2026-08-01" });
    expect(noPeriodo(antigo, 30, HOJE)).toBe(true);
    expect(noPeriodo(antigo, 5, HOJE)).toBe(false);
  });

  it("sem período, passa tudo", () => {
    expect(noPeriodo(carro({ dataCompra: "2019-01-01" }), null, HOJE)).toBe(true);
  });
});

describe("combinação", () => {
  it("os três filtros valem juntos", () => {
    const v = carro({ marca: "Fiat", dataCompra: "2026-08-01", valorCompra: 3_000_000 });
    expect(passaNosFiltros(v, { periodoDias: 30, marca: "Fiat", faixa: "a" }, HOJE)).toBe(true);
    expect(passaNosFiltros(v, { periodoDias: 30, marca: "Honda", faixa: "a" }, HOJE)).toBe(false);
    expect(passaNosFiltros(v, { periodoDias: 30, marca: "Fiat", faixa: "c" }, HOJE)).toBe(false);
    expect(passaNosFiltros(v, { periodoDias: 3, marca: "Fiat", faixa: "a" }, HOJE)).toBe(false);
  });

  it("sem filtro nenhum, nada é recortado", () => {
    expect(passaNosFiltros(carro(), SEM_FILTRO, HOJE)).toBe(true);
    expect(algumFiltroAtivo(SEM_FILTRO)).toBe(false);
    expect(algumFiltroAtivo({ ...SEM_FILTRO, marca: "Honda" })).toBe(true);
  });
});

describe("leitura da query string", () => {
  it("aceita o que faz sentido", () => {
    expect(lerFiltros(new URLSearchParams("periodo=90&marca=Honda&faixa=b")))
      .toEqual({ periodoDias: 90, marca: "Honda", faixa: "b" });
  });

  it("ignora o que não faz", () => {
    expect(lerFiltros(new URLSearchParams("periodo=abc&marca=&faixa=z")))
      .toEqual(SEM_FILTRO);
    expect(lerFiltros(new URLSearchParams("periodo=-5"))).toEqual(SEM_FILTRO);
    expect(lerFiltros(new URLSearchParams(""))).toEqual(SEM_FILTRO);
  });
});
