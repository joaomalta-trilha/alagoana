import { describe, it, expect } from "vitest";
import {
  digitar, digitarPedaco, NADA_DIGITADO, proximaLinha,
} from "../../src/util/digitacao.js";

/** Digita um pedaço e devolve o resultado, começando do zero. */
const teclar = (texto: string) => digitarPedaco(NADA_DIGITADO, texto);

describe("digitação de uma linha oculta", () => {
  it("acumula o que foi digitado e ecoa um ponto por tecla", () => {
    const r = teclar("abc");
    expect(r.estado.texto).toBe("abc");
    expect(r.eco).toBe("•••");
    expect(r.estado.concluida).toBe(false);
  });

  it("aceita acento, cedilha e os símbolos de uma senha de verdade", () => {
    expect(teclar("#Exemplo82").estado.texto).toBe("#Exemplo82");
    expect(teclar("çãÇÃ!@$%&*_-").estado.texto).toBe("çãÇÃ!@$%&*_-");
  });

  it("Enter fecha a linha", () => {
    const r = teclar("senha\r");
    expect(r.estado.concluida).toBe(true);
    expect(r.estado.texto).toBe("senha");
    expect(r.eco.endsWith("\n")).toBe(true);
  });

  it("backspace apaga o último caractere e o ponto correspondente", () => {
    const r = teclar("abc\u007f");
    expect(r.estado.texto).toBe("ab");
    expect(r.eco).toBe("•••\b \b");
  });

  it("backspace em linha vazia não faz nada", () => {
    const r = teclar("\u007f");
    expect(r.estado.texto).toBe("");
    expect(r.eco).toBe("");
  });

  it("Ctrl-C cancela e Ctrl-D fecha", () => {
    expect(teclar("ab\u0003").estado.cancelada).toBe(true);
    expect(teclar("ab\u0004").estado.concluida).toBe(true);
    expect(teclar("ab\u0004").estado.texto).toBe("ab");
  });

  it("setas não entram na senha", () => {
    // ESC [ A é seta para cima. Sem tratamento, o "[" e o "A" entrariam.
    const r = teclar("ab\u001b[Acd");
    expect(r.estado.texto).toBe("abcd");
  });
});

describe("o Enter que vem partido em dois — o defeito que motivou este arquivo", () => {
  it("num pedaço só, o \\n depois do \\r é ignorado", () => {
    const primeira = teclar("senha\r\nsegunda");
    expect(primeira.estado.texto).toBe("senha");
    expect(primeira.resto).toBe("\nsegunda");

    // A linha seguinte começa carregando o aviso de que o \n é do Enter anterior.
    const seguinte = digitarPedaco(proximaLinha(primeira.estado), primeira.resto);
    expect(seguinte.estado.texto).toBe("segunda");
    expect(seguinte.estado.concluida).toBe(false);
  });

  it("em pedaços separados, o \\n solto também é ignorado", () => {
    const primeira = teclar("senha\r");
    const seguinte = digitarPedaco(proximaLinha(primeira.estado), "\n");
    expect(seguinte.estado.texto).toBe("");
    expect(seguinte.estado.concluida).toBe(false);   // não fecha a linha sozinho
  });

  it("duas senhas iguais digitadas com \\r\\n continuam iguais", () => {
    const um = teclar("#Exemplo82\r\n");
    const dois = digitarPedaco(proximaLinha(um.estado), "#Exemplo82\r\n");
    expect(um.estado.texto).toBe(dois.estado.texto);
  });

  it("um \\n sozinho, sem \\r antes, fecha a linha normalmente", () => {
    // É o caso de entrada vinda de pipe, que não passa por terminal.
    const r = teclar("senha\n");
    expect(r.estado.concluida).toBe(true);
    expect(r.estado.texto).toBe("senha");
  });
});

describe("pedaço com mais de uma linha", () => {
  it("para no primeiro Enter e devolve o resto", () => {
    const r = teclar("uma\ndois\ntres");
    expect(r.estado.texto).toBe("uma");
    expect(r.resto).toBe("dois\ntres");
  });

  it("o eco só cobre o que foi processado", () => {
    expect(teclar("ab\ncd").eco).toBe("••\n");
  });
});

describe("passo a passo", () => {
  it("cada tecla devolve estado novo, sem mutar o anterior", () => {
    const inicial = NADA_DIGITADO;
    const depois = digitar(inicial, "x");
    expect(inicial.texto).toBe("");
    expect(depois.estado.texto).toBe("x");
    expect(depois.eco).toBe("•");
  });
});
