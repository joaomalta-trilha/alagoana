/**
 * As mensagens da §8, palavra por palavra.
 *
 * "Mensagens de validação são específicas, nunca genéricas" — então elas ficam
 * num lugar só, com o texto exato do documento, e os testes comparam contra
 * este arquivo. Interface nenhuma reescreve mensagem por conta própria.
 */

import { brl } from "./dinheiro.js";
import type { Centavos } from "./dinheiro.js";

export const MSG = {
  custoIncompleto: "Preencha descrição, data e um valor maior que zero.",
  retornoEmPatio: "Retorno só pode ser lançado em carro já vendido.",
  veiculoIncompleto:
    "Preencha marca, modelo, placa, data de compra e um valor de compra maior que zero.",
  vendaAntesDaCompra: "A data da venda não pode ser anterior à da compra.",
  rateioSemSelecao: "Selecione pelo menos um carro para o rateio.",
} as const;

/** `Saldo insuficiente em {conta}: {saldo}.` — §8 */
export function saldoInsuficiente(conta: string, saldo: Centavos): string {
  return `Saldo insuficiente em ${conta}: ${brl(saldo)}.`;
}

/**
 * Erro que vira 4xx com a mensagem exibida ao usuário.
 *
 * Tudo o que não for isto vira 500 com "Erro interno." e o detalhe fica no log
 * do servidor — mensagem de banco não é texto de interface.
 */
export class ErroDeValidacao extends Error {
  constructor(mensagem: string, readonly status = 422) {
    super(mensagem);
    this.name = "ErroDeValidacao";
  }
}

export class NaoEncontrado extends ErroDeValidacao {
  constructor(oQue = "Registro não encontrado.") {
    super(oQue, 404);
    this.name = "NaoEncontrado";
  }
}
