import { describe, it, expect } from "vitest";
import { metodosDe, resolver } from "../../src/http/rotas.js";

describe("despacho de rotas", () => {
  it("casa caminho fixo", () => {
    expect(resolver("GET", "/api/painel")?.rota.padrao).toBe("/api/painel");
    expect(resolver("GET", "/api/caixa")?.rota.padrao).toBe("/api/caixa");
  });

  it("extrai o parâmetro de caminho", () => {
    const r = resolver("GET", "/api/veiculos/7f876e4f-da1b-4038-8394-699fa23f714d");
    expect(r?.rota.padrao).toBe("/api/veiculos/:id");
    expect(r?.parametros["id"]).toBe("7f876e4f-da1b-4038-8394-699fa23f714d");
  });

  it("segmento literal ganha do parâmetro — /custos/atalhos não é /custos/:id", () => {
    expect(resolver("GET", "/api/custos/atalhos")?.rota.padrao).toBe("/api/custos/atalhos");
    expect(resolver("DELETE", "/api/custos/abc")?.rota.padrao).toBe("/api/custos/:id");
  });

  it("distingue o método", () => {
    expect(resolver("GET", "/api/veiculos")?.rota.metodo).toBe("GET");
    expect(resolver("POST", "/api/veiculos")?.rota.metodo).toBe("POST");
    expect(resolver("PUT", "/api/veiculos")).toBeNull();
  });

  it("não casa caminho de tamanho diferente", () => {
    expect(resolver("GET", "/api/veiculos/abc/def/ghi")).toBeNull();
    expect(resolver("GET", "/api")).toBeNull();
  });

  it("sabe quais métodos um caminho aceita, para responder 405", () => {
    expect(metodosDe("/api/veiculos").sort()).toEqual(["GET", "POST"]);
    expect(metodosDe("/api/veiculos/abc").sort()).toEqual(["DELETE", "GET", "PATCH"]);
    expect(metodosDe("/api/inexistente")).toEqual([]);
  });

  it("a rota de venda existe só como POST", () => {
    expect(resolver("POST", "/api/veiculos/abc/venda")?.rota.padrao)
      .toBe("/api/veiculos/:id/venda");
    expect(resolver("GET", "/api/veiculos/abc/venda")).toBeNull();
  });
});
