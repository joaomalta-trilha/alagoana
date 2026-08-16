/**
 * A máquina de estados de uma linha digitada sem eco.
 *
 * Existe separada do terminal porque foi exatamente aqui que a primeira versão
 * errou: o Enter de alguns terminais manda `\r\n`, e o `\n` que sobrava entrava
 * sozinho na pergunta seguinte, respondendo vazio antes da pessoa digitar
 * qualquer coisa. Erro de leitura de caractere é o tipo de coisa que se prova
 * com teste e não se prova olhando.
 *
 * Cada tecla devolve também o `eco`: o que escrever no terminal para a pessoa
 * ver que está digitando. Sem eco nenhum, uma senha longa parece um travamento.
 */

export interface Digitacao {
  /** O que foi digitado até agora. */
  texto: string;
  /** A linha terminou (Enter ou Ctrl-D). */
  concluida: boolean;
  /** Ctrl-C. */
  cancelada: boolean;
  /** Um `\n` logo depois de um `\r` é a segunda metade do mesmo Enter. */
  aguardandoLf: boolean;
  /** Dentro de uma sequência de escape — seta, F1, etc. */
  escapando: boolean;
}

export const NADA_DIGITADO: Digitacao = {
  texto: "", concluida: false, cancelada: false, aguardandoLf: false, escapando: false,
};

/** Recomeça uma linha, preservando o que atravessa a fronteira dela. */
export function proximaLinha(d: Digitacao): Digitacao {
  return { ...NADA_DIGITADO, aguardandoLf: d.aguardandoLf, escapando: d.escapando };
}

const APAGAR = "\b \b";      // volta, cobre com espaço, volta de novo
const MASCARA = "•";

/** Processa um caractere. Devolve o estado novo e o que ecoar por ele. */
export function digitar(d: Digitacao, c: string): { estado: Digitacao; eco: string } {
  const seguir = (mudanca: Partial<Digitacao>, eco = "") =>
    ({ estado: { ...d, aguardandoLf: false, ...mudanca }, eco });

  // Segunda metade de um `\r\n`: já foi contada no `\r`.
  if (d.aguardandoLf && c === "\n") return seguir({});

  // Setas e teclas de função chegam como `ESC [ A`. Sem isto, o `[` e o `A`
  // entrariam na senha.
  if (d.escapando) {
    return seguir({ escapando: !/[A-Za-z~]/.test(c) });
  }
  if (c === "\u001b") return seguir({ escapando: true });

  if (c === "\r") return seguir({ concluida: true, aguardandoLf: true }, "\n");
  if (c === "\n" || c === "\u0004") return seguir({ concluida: true }, "\n");
  if (c === "\u0003") return seguir({ cancelada: true }, "\n");

  if (c === "\u007f" || c === "\b") {
    if (!d.texto) return seguir({});
    return seguir({ texto: d.texto.slice(0, -1) }, APAGAR);
  }

  // Tudo que for imprimível entra — inclusive acento, cedilha e `#`.
  if (c >= " ") return seguir({ texto: d.texto + c }, MASCARA);

  return seguir({});                                  // demais controles: ignora
}

/**
 * Processa um pedaço inteiro, parando quando a linha fecha.
 *
 * O `resto` é o que veio depois do Enter — teclado adiantado, ou o `\n` de um
 * `\r\n`. Quem chama guarda para a linha seguinte, em vez de descartar.
 */
export function digitarPedaco(
  d: Digitacao, pedaco: string,
): { estado: Digitacao; eco: string; resto: string } {
  let estado = d;
  let eco = "";
  const caracteres = [...pedaco];

  for (const [i, c] of caracteres.entries()) {
    const passo = digitar(estado, c);
    estado = passo.estado;
    eco += passo.eco;
    if (estado.concluida || estado.cancelada) {
      return { estado, eco, resto: caracteres.slice(i + 1).join("") };
    }
  }
  return { estado, eco, resto: "" };
}
