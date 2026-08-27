/**
 * Comissões — §4.6.
 *
 * O padrão da casa era Alagoana R$ 1.000 + Victor R$ 500 em duas linhas. Em
 * 17/08/2026 a loja pediu uma linha só, de R$ 1.500 em nome da Alagoana: o
 * rateio entre os sócios não é assunto da ficha do carro, e duas linhas para
 * um valor só faziam a lista de custos parecer mais movimentada do que é.
 *
 * A lista continua sendo lista, e não um número, porque a §4.6 pede valores
 * configuráveis — e porque voltar a separar é trocar uma linha em `config`,
 * não mexer em código.
 */

import type { Centavos } from "./dinheiro.js";

export const CATEGORIA_COMISSAO = "Comissão";

export interface Comissao {
  beneficiario: string;
  valor: Centavos;
}

/** O que o seed grava em `config.comissoes_padrao` quando não há nada gravado. */
export const COMISSOES_PADRAO: readonly Comissao[] = [
  { beneficiario: "Comissão Alagoana", valor: 150_000 },
];

/**
 * O checkbox da tela de venda vem marcado?
 *
 * A §4.6 dizia "desmarcado quando o veículo já possui algum custo de categoria
 * Comissão, porque já foram provisionadas na entrada". Enquanto nada
 * provisionava, "ter comissão" e "ter comissão paga" eram a mesma coisa.
 *
 * Desde 22/08/2026 todo carro nasce provisionado, e aí os dois se separam. O
 * que importa é se ela já foi **paga**: provisão pendente vem marcada, para a
 * venda pagá-la; comissão já paga vem desmarcada, para ninguém cobrar duas
 * vezes o mesmo carro.
 */
export function marcarComissoesPorPadrao(jaTemComissaoPaga: boolean): boolean {
  return !jaTemComissaoPaga;
}

/** Valida o que veio de `config`, caindo no padrão quando o conteúdo não serve. */
export function lerComissoes(guardado: unknown): readonly Comissao[] {
  if (!Array.isArray(guardado)) return COMISSOES_PADRAO;
  const lidas = guardado.filter((c): c is Comissao =>
    typeof c === "object" && c !== null &&
    typeof (c as Comissao).beneficiario === "string" &&
    Number.isSafeInteger((c as Comissao).valor) && (c as Comissao).valor > 0);
  return lidas.length ? lidas : COMISSOES_PADRAO;
}
