import { describe, it, expect } from "vitest";
import { escreverCookie, lerCookie } from "../../src/http/cookies.js";

describe("leitura do cabeçalho Cookie", () => {
  it("acha o cookie entre os outros", () => {
    expect(lerCookie("sessao=abc123", "sessao")).toBe("abc123");
    expect(lerCookie("outro=1; sessao=abc123; mais=2", "sessao")).toBe("abc123");
    expect(lerCookie("  sessao = abc123  ", "sessao")).toBe("abc123");
  });

  it("não confunde nome parecido", () => {
    expect(lerCookie("sessao_antiga=xxx", "sessao")).toBeNull();
    expect(lerCookie("nao_sessao=xxx", "sessao")).toBeNull();
  });

  it("sem cabeçalho, sem cookie", () => {
    expect(lerCookie(undefined, "sessao")).toBeNull();
    expect(lerCookie("", "sessao")).toBeNull();
    expect(lerCookie("lixo-sem-igual", "sessao")).toBeNull();
  });

  it("valor percent-encoded volta decodificado, e valor quebrado vira nulo", () => {
    expect(lerCookie("sessao=a%2Fb", "sessao")).toBe("a/b");
    expect(lerCookie("sessao=%E0%A4%A", "sessao")).toBeNull();
  });
});

describe("escrita do Set-Cookie", () => {
  it("o cookie de sessão sai httpOnly e SameSite=Lax", () => {
    const c = escreverCookie("sessao", "abc", { maxAge: 2_592_000, httpOnly: true });
    expect(c).toBe("sessao=abc; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax");
  });

  it("Secure só aparece quando pedido", () => {
    expect(escreverCookie("s", "v", { secure: true })).toContain("; Secure");
    expect(escreverCookie("s", "v")).not.toContain("Secure");
  });

  it("Max-Age=0 é o que apaga o cookie no logout", () => {
    expect(escreverCookie("sessao", "", { maxAge: 0 })).toContain("Max-Age=0");
  });

  it("escapa o valor", () => {
    expect(escreverCookie("s", "a b;c")).toContain("s=a%20b%3Bc");
  });
});
