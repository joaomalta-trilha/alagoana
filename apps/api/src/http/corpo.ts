/**
 * Leitura do corpo JSON com recusa específica.
 *
 * Nada aqui adivinha: campo de dinheiro que vem como `"1.000,00"` ou como
 * `1000.5` é recusado, não convertido. A §2 é explícita — "todo valor
 * monetário em NUMERIC(12,2), nunca ponto flutuante" — e a fronteira da API é
 * onde essa regra ou vale ou já foi perdida.
 *
 * A API troca dinheiro em **centavos inteiros**: 93.853,20 chega como 9385320.
 */

import { ErroDeValidacao } from "../dominio/mensagens.js";
import type { Centavos } from "../dominio/dinheiro.js";
import type { DataISO } from "../dominio/veiculo.js";

export type Corpo = Record<string, unknown>;

export function comoCorpo(bruto: unknown): Corpo {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    throw new ErroDeValidacao("Corpo da requisição precisa ser um objeto JSON.", 400);
  }
  return bruto as Corpo;
}

export function texto(c: Corpo, campo: string): string | null {
  const v = c[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ErroDeValidacao(`O campo ${campo} precisa ser texto.`, 400);
  const limpo = v.trim();
  return limpo === "" ? null : limpo;
}

export function inteiro(c: Corpo, campo: string): number | null {
  const v = c[campo];
  if (v === undefined || v === null) return null;
  if (!Number.isSafeInteger(v)) {
    throw new ErroDeValidacao(`O campo ${campo} precisa ser um número inteiro.`, 400);
  }
  return v as number;
}

/** Dinheiro chega em centavos inteiros. Fracionário aqui é erro do chamador. */
export function centavos(c: Corpo, campo: string): Centavos | null {
  const v = c[campo];
  if (v === undefined || v === null) return null;
  if (!Number.isSafeInteger(v)) {
    throw new ErroDeValidacao(
      `O campo ${campo} precisa vir em centavos inteiros — 93.853,20 é 9385320.`, 400);
  }
  return v as Centavos;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function data(c: Corpo, campo: string): DataISO | null {
  const v = texto(c, campo);
  if (v === null) return null;
  if (!ISO.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new ErroDeValidacao(`O campo ${campo} precisa ser uma data AAAA-MM-DD.`, 400);
  }
  return v;
}

export function booleano(c: Corpo, campo: string): boolean | null {
  const v = c[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "boolean") {
    throw new ErroDeValidacao(`O campo ${campo} precisa ser verdadeiro ou falso.`, 400);
  }
  return v;
}

export function listaDeTexto(c: Corpo, campo: string): string[] {
  const v = c[campo];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new ErroDeValidacao(`O campo ${campo} precisa ser uma lista de textos.`, 400);
  }
  return v as string[];
}

export function listaDeObjetos(c: Corpo, campo: string): Corpo[] {
  const v = c[campo];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "object" || x === null || Array.isArray(x))) {
    throw new ErroDeValidacao(`O campo ${campo} precisa ser uma lista de objetos.`, 400);
  }
  return v as Corpo[];
}

export function objeto(c: Corpo, campo: string): Corpo | null {
  const v = c[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ErroDeValidacao(`O campo ${campo} precisa ser um objeto.`, 400);
  }
  return v as Corpo;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recusa antes do banco: uuid inválido vira 400, não erro de driver. */
export function uuid(valor: string | null, oQue: string): string | null {
  if (valor === null) return null;
  if (!UUID.test(valor)) throw new ErroDeValidacao(`${oQue} inválido.`, 400);
  return valor;
}

export function uuidDoCorpo(c: Corpo, campo: string): string | null {
  return uuid(texto(c, campo), `O campo ${campo}`);
}

/**
 * "Não descontar do caixa" (§4.7) é `null`, e é uma escolha explícita —
 * `contaId` ausente e `contaId: null` significam a mesma coisa de propósito.
 */
export function contaOpcional(c: Corpo): string | null {
  return uuidDoCorpo(c, "contaId");
}
