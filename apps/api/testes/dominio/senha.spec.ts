import { describe, it, expect } from "vitest";
import {
  MIN_SENHA, conferirSenha, gerarHash, validarSenha, HASH_FANTASMA,
} from "../../src/dominio/senha.js";

describe("hash de senha", () => {
  it("é argon2id, no formato PHC", async () => {
    const h = await gerarHash("cavalo-bateria-grampo");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("cavalo-bateria-grampo");
  });

  it("a mesma senha gera hashes diferentes — o sal é por senha", async () => {
    const [a, b] = await Promise.all([gerarHash("mesma-senha-aqui"), gerarHash("mesma-senha-aqui")]);
    expect(a).not.toBe(b);
    expect(await conferirSenha(a, "mesma-senha-aqui")).toBe(true);
    expect(await conferirSenha(b, "mesma-senha-aqui")).toBe(true);
  });

  it("aceita a senha certa e recusa a errada", async () => {
    const h = await gerarHash("senha-do-ricardo");
    expect(await conferirSenha(h, "senha-do-ricardo")).toBe(true);
    expect(await conferirSenha(h, "senha-do-ricard")).toBe(false);
    expect(await conferirSenha(h, "Senha-do-Ricardo")).toBe(false);
    expect(await conferirSenha(h, "")).toBe(false);
  });

  it("hash corrompido é recusa, não exceção na tela de login", async () => {
    expect(await conferirSenha("isto não é um hash", "qualquer-coisa")).toBe(false);
    expect(await conferirSenha("", "qualquer-coisa")).toBe(false);
  });

  it("o hash fantasma existe e não casa com nada", async () => {
    const h = await HASH_FANTASMA;
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await conferirSenha(h, "senha-qualquer")).toBe(false);
  });
});

describe("política de senha", () => {
  it("recusa senha curta demais", () => {
    expect(validarSenha("a".repeat(MIN_SENHA - 1))).toMatch(/pelo menos/);
    expect(validarSenha("")).toMatch(/pelo menos/);
  });

  it("aceita a partir do mínimo", () => {
    expect(validarSenha("a".repeat(MIN_SENHA))).toBeNull();
    expect(validarSenha("uma senha longa o suficiente")).toBeNull();
  });

  it("recusa a senha que é o próprio e-mail", () => {
    expect(validarSenha("joao@alagoana.local", "joao@alagoana.local")).toMatch(/igual ao e-mail/);
    expect(validarSenha("  JOAO@alagoana.local ", "joao@alagoana.local")).toMatch(/igual ao e-mail/);
    expect(validarSenha("outra-coisa-qualquer", "joao@alagoana.local")).toBeNull();
  });
});
