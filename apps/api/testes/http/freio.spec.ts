import { describe, it, expect } from "vitest";
import { Freio } from "../../src/http/freio.js";

const MINUTO = 60_000;
const T0 = 1_000_000;

describe("freio de tentativas de login", () => {
  it("deixa passar enquanto está abaixo do limite", () => {
    const freio = new Freio(3, 15 * MINUTO);
    for (let i = 0; i < 2; i++) {
      expect(freio.esperaRestante("joao|::1", T0)).toBe(0);
      freio.registrarFalha("joao|::1", T0);
    }
    expect(freio.esperaRestante("joao|::1", T0)).toBe(0);
  });

  it("bloqueia ao atingir o limite e libera quando a janela vence", () => {
    const freio = new Freio(3, 15 * MINUTO);
    for (let i = 0; i < 3; i++) freio.registrarFalha("joao|::1", T0);

    expect(freio.esperaRestante("joao|::1", T0)).toBe(15 * MINUTO);
    expect(freio.esperaRestante("joao|::1", T0 + 14 * MINUTO)).toBe(MINUTO);
    expect(freio.esperaRestante("joao|::1", T0 + 15 * MINUTO)).toBe(0);
  });

  it("insistir durante o bloqueio empurra o desbloqueio para frente", () => {
    const freio = new Freio(3, 15 * MINUTO);
    for (let i = 0; i < 3; i++) freio.registrarFalha("joao|::1", T0);

    freio.registrarFalha("joao|::1", T0 + 10 * MINUTO);
    expect(freio.esperaRestante("joao|::1", T0 + 15 * MINUTO)).toBe(10 * MINUTO);
  });

  it("bloqueia por chave, não o servidor inteiro", () => {
    const freio = new Freio(3, 15 * MINUTO);
    for (let i = 0; i < 3; i++) freio.registrarFalha("joao|::1", T0);

    expect(freio.esperaRestante("joao|::1", T0)).toBe(15 * MINUTO);
    expect(freio.esperaRestante("victor|::1", T0)).toBe(0);
    expect(freio.esperaRestante("joao|10.0.0.9", T0)).toBe(0);
  });

  it("acertar a senha limpa o histórico de falhas", () => {
    const freio = new Freio(3, 15 * MINUTO);
    freio.registrarFalha("joao|::1", T0);
    freio.registrarFalha("joao|::1", T0);
    freio.limpar("joao|::1");

    freio.registrarFalha("joao|::1", T0);
    expect(freio.esperaRestante("joao|::1", T0)).toBe(0);   // voltou a contar do zero
  });

  it("falhas espaçadas além da janela não se acumulam", () => {
    const freio = new Freio(3, 15 * MINUTO);
    for (let i = 0; i < 5; i++) freio.registrarFalha("joao|::1", T0 + i * 20 * MINUTO);
    expect(freio.esperaRestante("joao|::1", T0 + 4 * 20 * MINUTO)).toBe(0);
  });
});
