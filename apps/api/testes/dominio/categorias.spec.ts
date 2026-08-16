import { describe, it, expect } from "vitest";
import {
  CATEGORIAS_CUSTO, NOMES_CATEGORIA, acharCategoria, categoriasSelecionaveis,
} from "../../src/dominio/categorias.js";

/**
 * O bloco de código da §3.7, copiado da especificação sem edição. Se alguém
 * mexer na ordem ou no acento de uma categoria, é aqui que quebra.
 */
const DA_ESPECIFICACAO = `
Combustível, Transferência, Consulta, Peças, Pintura, Polimento, Reparo,
Manutenção, Revisão, Serviço, Guincho, IPVA, Imposto, Amarelinha, Cautelar,
Bateria, Chaveiro, Lâmpada, Patrocinado, Comissão, Retorno, Troca, Não detalhado
`.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);

describe("categorias de custo (§3.7)", () => {
  it("é a lista da especificação, na ordem exata", () => {
    expect(NOMES_CATEGORIA).toEqual(DA_ESPECIFICACAO);
    expect(CATEGORIAS_CUSTO).toHaveLength(23);
  });

  it("não tem nome repetido", () => {
    expect(new Set(NOMES_CATEGORIA).size).toBe(NOMES_CATEGORIA.length);
  });

  it("as duas regras especiais estão marcadas, e só elas", () => {
    expect(acharCategoria("Retorno")).toEqual(
      { nome: "Retorno", selecionavel: true, exigeVendido: true });
    expect(acharCategoria("Não detalhado")).toEqual(
      { nome: "Não detalhado", selecionavel: false, exigeVendido: false });

    expect(CATEGORIAS_CUSTO.filter((c) => c.exigeVendido).map((c) => c.nome))
      .toEqual(["Retorno"]);
    expect(CATEGORIAS_CUSTO.filter((c) => !c.selecionavel).map((c) => c.nome))
      .toEqual(["Não detalhado"]);
  });

  it("categoria inexistente não é achada", () => {
    expect(acharCategoria("Lavagem")).toBeUndefined();
    expect(acharCategoria("retorno")).toBeUndefined();   // sensível a maiúscula
  });
});

describe("o que o seletor oferece", () => {
  it("em carro no pátio, sem Retorno e sem Não detalhado", () => {
    const nomes = categoriasSelecionaveis(false).map((c) => c.nome);
    expect(nomes).toHaveLength(21);
    expect(nomes).not.toContain("Retorno");
    expect(nomes).not.toContain("Não detalhado");
    expect(nomes[0]).toBe("Combustível");
  });

  it("em carro vendido, Retorno aparece — é custo de garantia (§4.4)", () => {
    const nomes = categoriasSelecionaveis(true).map((c) => c.nome);
    expect(nomes).toHaveLength(22);
    expect(nomes).toContain("Retorno");
    expect(nomes).not.toContain("Não detalhado");
  });

  it("preserva a ordem da especificação", () => {
    const nomes = categoriasSelecionaveis(true).map((c) => c.nome);
    const esperado = DA_ESPECIFICACAO.filter((n) => n !== "Não detalhado");
    expect(nomes).toEqual(esperado);
  });
});
