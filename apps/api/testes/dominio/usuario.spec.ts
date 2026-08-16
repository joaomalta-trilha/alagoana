import { describe, it, expect } from "vitest";
import {
  emailValido, nomeValido, normalizarEmail, validarUsuario,
} from "../../src/dominio/usuario.js";

describe("normalização de e-mail", () => {
  it("tira espaço e deixa minúsculo", () => {
    expect(normalizarEmail("  Joao@Exemplo.COM  ")).toBe("joao@exemplo.com");
  });

  it("tira aspas em volta, inclusive as tipográficas", () => {
    expect(normalizarEmail('"joao@exemplo.com"')).toBe("joao@exemplo.com");
    expect(normalizarEmail("'joao@exemplo.com'")).toBe("joao@exemplo.com");
    // O caso real: aspas curvas, invisíveis a olho nu.
    expect(normalizarEmail("“joao@exemplo.com”")).toBe("joao@exemplo.com");
  });

  it("não mexe no que já está limpo", () => {
    expect(normalizarEmail("joao@exemplo.com")).toBe("joao@exemplo.com");
  });
});

describe("formato de e-mail", () => {
  it("aceita os que existem de verdade", () => {
    for (const bom of ["joao@exemplo.com", "victor.malta@alagoana.com.br",
                       "a+b@x.co", "joao_pedro@somostrilha.com.br"]) {
      expect(emailValido(bom)).toBe(true);
    }
  });

  it("recusa o que não é e-mail", () => {
    for (const ruim of ["", "joao", "joao@", "@exemplo.com", "joao exemplo@x.com",
                        "joao@exemplo", "joao@@exemplo.com", "joao@exemplo.c"]) {
      expect(emailValido(ruim)).toBe(false);
    }
  });

  it("recusa e-mail absurdamente longo", () => {
    expect(emailValido(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});

describe("nome", () => {
  it("precisa de pelo menos duas letras", () => {
    expect(nomeValido("Vi")).toBe(true);
    expect(nomeValido("V")).toBe(false);
    expect(nomeValido("   ")).toBe(false);
  });
});

describe("validação conjunta", () => {
  it("passa quando os dois servem", () => {
    expect(validarUsuario("Victor Malta", " Victor@Alagoana.com.br ")).toBeNull();
  });

  it("recusa com mensagem específica", () => {
    expect(validarUsuario("", "victor@x.com")).toBe("Informe o nome da pessoa.");
    expect(validarUsuario("Victor", "victor")).toBe("E-mail inválido: victor");
  });
});
