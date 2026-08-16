/**
 * O que o sistema lembra durante a sessão.
 *
 * §4.7: "O sistema lembra a última conta usada na sessão e a pré-seleciona."
 * §6.7: "A data escolhida fica lembrada na sessão."
 *
 * Fica em memória de propósito: é preferência de uso, não dado. Recarregar a
 * página começa do zero, e isso é aceitável — o custo de errar aqui é um
 * toque a mais, não um número errado.
 */

import { hojeISO } from "./formato.js";

export const sessao = {
  ultimaConta: "" as string,
  ultimaData: hojeISO(),
};
