import { describe, it, expect } from "vitest";
import {
  etiquetaDe, lerTipo, temCatalogo, TIPOS, TIPO_PADRAO, tipoValido,
} from "../../src/dominio/tipo-veiculo.js";

describe("tipos de veículo", () => {
  it("são três, nesta ordem", () => {
    expect(TIPOS.map((t) => t.valor)).toEqual(["carro", "moto", "outro"]);
    expect(TIPOS.map((t) => t.rotulo)).toEqual(["Carro", "Moto", "Outros"]);
  });

  it("carro é o padrão — a carga inicial inteira é carro", () => {
    expect(TIPO_PADRAO).toBe("carro");
  });

  it("só carro e moto têm catálogo", () => {
    expect(temCatalogo("carro")).toBe(true);
    expect(temCatalogo("moto")).toBe(true);
    expect(temCatalogo("outro")).toBe(false);
  });

  it("carro não ganha etiqueta, porque é o caso comum", () => {
    expect(etiquetaDe("carro")).toBeNull();
    expect(etiquetaDe("moto")).toBe("moto");
    expect(etiquetaDe("outro")).toBe("outro");
  });
});

describe("leitura do que vem de fora", () => {
  it("reconhece os válidos", () => {
    for (const t of ["carro", "moto", "outro"]) expect(tipoValido(t)).toBe(true);
  });

  it("recusa o resto", () => {
    for (const t of ["Carro", "caminhao", "", null, 1, undefined]) {
      expect(tipoValido(t)).toBe(false);
    }
  });

  it("ausente vira carro, para o cadastro comum não precisar pensar nisso", () => {
    expect(lerTipo(undefined)).toBe("carro");
    expect(lerTipo(null)).toBe("carro");
    expect(lerTipo("")).toBe("carro");
  });

  it("valor inventado é erro, não silêncio", () => {
    expect(() => lerTipo("caminhao")).toThrow(/inválido/);
    expect(() => lerTipo("CARRO")).toThrow(/inválido/);
  });
});
