import { describe, it, expect } from "vitest";
import {
  DURACAO_DIAS, INTERVALO_RENOVACAO_HORAS, MAX_AGE_SEGUNDOS, NOME_COOKIE,
  expiraEm, expirada, hashToken, mesmoHash, novoToken, precisaRenovar,
} from "../../src/dominio/sessao.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AGORA = new Date("2026-08-09T12:00:00-03:00");

describe("token de sessão", () => {
  it("são 32 bytes em base64url — nada para escapar em cookie", () => {
    const t = novoToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
  });

  it("dois tokens nunca coincidem", () => {
    const tokens = new Set(Array.from({ length: 500 }, novoToken));
    expect(tokens.size).toBe(500);
  });
});

describe("hash do token", () => {
  it("é sha256, determinístico", () => {
    const t = novoToken();
    expect(hashToken(t)).toHaveLength(32);
    expect(hashToken(t).equals(hashToken(t))).toBe(true);
  });

  it("tokens diferentes dão hashes diferentes", () => {
    expect(hashToken("a").equals(hashToken("b"))).toBe(false);
  });

  it("comparação segura casa igual e recusa diferente e de outro tamanho", () => {
    const h = hashToken("token");
    expect(mesmoHash(h, hashToken("token"))).toBe(true);
    expect(mesmoHash(h, hashToken("outro"))).toBe(false);
    expect(mesmoHash(h, Buffer.alloc(16))).toBe(false);
  });
});

describe("prazo de 30 dias (§5)", () => {
  it("expira exatamente 30 dias depois", () => {
    expect(expiraEm(AGORA).getTime() - AGORA.getTime()).toBe(DURACAO_DIAS * DIA);
  });

  it("o Max-Age do cookie acompanha a expiração do banco", () => {
    expect(MAX_AGE_SEGUNDOS).toBe(DURACAO_DIAS * 24 * 60 * 60);
    expect(NOME_COOKIE).toBe("sessao");
  });

  it("vale até o instante do vencimento, não depois", () => {
    const fim = expiraEm(AGORA);
    expect(expirada(fim, new Date(fim.getTime() - 1))).toBe(false);
    expect(expirada(fim, fim)).toBe(true);
    expect(expirada(fim, new Date(fim.getTime() + 1))).toBe(true);
  });
});

describe("renovação por uso", () => {
  it("uso seguido não escreve no banco", () => {
    expect(precisaRenovar(AGORA, new Date(AGORA.getTime() + 1000))).toBe(false);
    expect(precisaRenovar(AGORA, new Date(AGORA.getTime() + 23 * HORA))).toBe(false);
  });

  it("renova quando o último uso completa a janela", () => {
    const janela = INTERVALO_RENOVACAO_HORAS * HORA;
    expect(precisaRenovar(AGORA, new Date(AGORA.getTime() + janela))).toBe(true);
    expect(precisaRenovar(AGORA, new Date(AGORA.getTime() + janela - 1))).toBe(false);
  });

  it("quem usa todo dia nunca é deslogado", () => {
    let expira = expiraEm(AGORA);
    let ultimoUso = AGORA;
    for (let dia = 1; dia <= 365; dia++) {
      const agora = new Date(AGORA.getTime() + dia * DIA);
      expect(expirada(expira, agora)).toBe(false);
      if (precisaRenovar(ultimoUso, agora)) {
        expira = expiraEm(agora);
        ultimoUso = agora;
      }
    }
  });

  it("quem some por mais de 30 dias precisa entrar de novo", () => {
    const expira = expiraEm(AGORA);
    expect(expirada(expira, new Date(AGORA.getTime() + 31 * DIA))).toBe(true);
  });
});
