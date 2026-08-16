import { describe, it, expect } from "vitest";
import { ipDoPedido } from "../../src/http/ip.js";

const SOCKET = "10.0.0.1";

describe("sem proxy na frente", () => {
  it("o IP é o do socket, e o cabeçalho é ignorado", () => {
    expect(ipDoPedido("203.0.113.9", SOCKET, 0)).toBe(SOCKET);
    expect(ipDoPedido(undefined, SOCKET, 0)).toBe(SOCKET);
  });

  it("cabeçalho forjado não muda nada — é o ponto", () => {
    expect(ipDoPedido("1.1.1.1, 2.2.2.2", SOCKET, 0)).toBe(SOCKET);
  });
});

describe("com um proxy na frente", () => {
  it("pega o endereço que o proxy observou, não o que o cliente escreveu", () => {
    // O cliente forjou "1.1.1.1"; o proxy acrescentou o que ele viu de verdade.
    expect(ipDoPedido("1.1.1.1, 203.0.113.9", SOCKET, 1)).toBe("203.0.113.9");
  });

  it("com um item só, é o cliente mesmo", () => {
    expect(ipDoPedido("203.0.113.9", SOCKET, 1)).toBe("203.0.113.9");
  });

  it("tolera espaços e cabeçalho repetido", () => {
    expect(ipDoPedido("  1.1.1.1 ,  203.0.113.9  ", SOCKET, 1)).toBe("203.0.113.9");
    expect(ipDoPedido(["1.1.1.1", "203.0.113.9"], SOCKET, 1)).toBe("203.0.113.9");
  });

  it("sem cabeçalho, cai no socket", () => {
    expect(ipDoPedido(undefined, SOCKET, 1)).toBe(SOCKET);
    expect(ipDoPedido("", SOCKET, 1)).toBe(SOCKET);
    expect(ipDoPedido("  ,  ", SOCKET, 1)).toBe(SOCKET);
  });
});

describe("com dois proxies", () => {
  it("anda duas posições para trás", () => {
    expect(ipDoPedido("203.0.113.9, 10.1.1.1", SOCKET, 2)).toBe("203.0.113.9");
  });

  it("confiar em mais proxies do que existem não estoura a lista", () => {
    expect(ipDoPedido("203.0.113.9", SOCKET, 5)).toBe("203.0.113.9");
  });
});

describe("o que este teste existe para impedir", () => {
  it("um atacante não escolhe o próprio IP para escapar do freio", () => {
    // Cinco tentativas, cada uma com um IP forjado diferente na frente da lista.
    const vistos = ["9.9.9.1", "9.9.9.2", "9.9.9.3"].map((forjado) =>
      ipDoPedido(`${forjado}, 203.0.113.9`, SOCKET, 1));
    expect(new Set(vistos).size).toBe(1);
    expect(vistos[0]).toBe("203.0.113.9");
  });
});
