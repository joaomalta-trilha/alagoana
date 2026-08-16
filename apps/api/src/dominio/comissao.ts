/**
 * Comissões — §4.6.
 *
 * "Padrão da casa: Comissão Alagoana R$ 1.000 + Comissão Victor R$ 500,
 * lançadas como custo de categoria Comissão." Os valores ficam em `config`,
 * não no código: a especificação pede que sejam configuráveis.
 */

import type { Centavos } from "./dinheiro.js";

export const CATEGORIA_COMISSAO = "Comissão";

export interface Comissao {
  beneficiario: string;
  valor: Centavos;
}

/** O que o seed grava em `config.comissoes_padrao` quando não há nada gravado. */
export const COMISSOES_PADRAO: readonly Comissao[] = [
  { beneficiario: "Comissão Alagoana", valor: 100_000 },
  { beneficiario: "Comissão Victor", valor: 50_000 },
];

/**
 * O checkbox da tela de venda vem marcado?
 *
 * §4.6: "Vem marcado por padrão, exceto quando o veículo já possui algum custo
 * de categoria Comissão — caso em que vem desmarcado, porque já foram
 * provisionadas na entrada."
 */
export function marcarComissoesPorPadrao(jaTemComissaoLancada: boolean): boolean {
  return !jaTemComissaoLancada;
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
