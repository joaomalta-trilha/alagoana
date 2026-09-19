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

  // Abaixo, o que não vem da §8 — funções que a loja pediu depois. Mesmo
  // lugar, mesma regra: o texto é um só, e nenhuma tela o reescreve.
  transferenciaMesmaConta: "A conta de origem e a de destino precisam ser diferentes.",
  transferenciaSemValor: "Informe um valor de transferência maior que zero.",
  vendaJaDesfeita: "Este carro não está vendido.",
  transferenciaNaoEncontrada: "Transferência não encontrada.",
  despesaIncompleta:
    "Preencha conta, descrição, data e um valor maior que zero.",
} as const;

/** `Saldo insuficiente em {conta}: {saldo}.` — §8 */
export function saldoInsuficiente(conta: string, saldo: Centavos): string {
  return `Saldo insuficiente em ${conta}: ${brl(saldo)}.`;
}

/**
 * Desfazer a venda com os carros da troca ou do repasse ainda no pátio os
 * deixaria órfãos.
 *
 * O rótulo só diz "repasse" quando TODOS os que entraram são repasse — numa
 * venda mista, "na troca" continua descrevendo a maioria dos casos reais e
 * evita a gramática de listar dois rótulos diferentes para uma coisa só.
 */
export function trocaImpedeDesfazer(
  entraram: ReadonlyArray<{ codigo: string; descricao: string; origem: "troca" | "repasse" }>,
): string {
  const lista = entraram.map((v) => `${v.codigo} · ${v.descricao}`).join(", ");
  const rotulo = entraram.every((v) => v.origem === "repasse") ? "como repasse" : "na troca";
  return entraram.length === 1
    ? `Nesta venda entrou o ${lista} ${rotulo}. Exclua esse carro antes de desfazer a venda.`
    : `Nesta venda entraram ${entraram.length} veículos ${rotulo}: ${lista}. ` +
      "Exclua esses carros antes de desfazer a venda.";
}

/** Tirar a venda do extrato é tirar dinheiro da conta — e ele pode não estar lá. */
export function saldoNaoDevolveVenda(conta: string, saldo: Centavos, valor: Centavos): string {
  return `Desfazer a venda tira ${brl(valor)} de ${conta}, que tem ${brl(saldo)}. ` +
    "Lance a entrada que falta ou desfaça primeiro o que gastou desse dinheiro.";
}

/** Apagar a transferência tira o dinheiro de volta do destino — se ele tiver. */
export function saldoNaoDesfazTransferencia(
  conta: string, saldo: Centavos, valor: Centavos,
): string {
  return `Apagar esta transferência tira ${brl(valor)} de ${conta}, que tem ${brl(saldo)}. ` +
    "Devolva o dinheiro à conta antes, ou apague o que foi gasto com ele.";
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
