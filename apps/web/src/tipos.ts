/**
 * Rótulos de tipo de veículo.
 *
 * A lista de tipos vem da API (é o domínio que manda), mas a ficha precisa
 * mostrar o rótulo de um tipo isolado, sem ter a lista à mão. Como são três e
 * não mudam, valem como constante aqui.
 */

import type { TipoVeiculo } from "./api.js";

const ROTULOS: Record<TipoVeiculo, string> = {
  carro: "Carro",
  moto: "Moto",
  outro: "Outro",
};

export function rotuloDoTipo(tipo: TipoVeiculo): string {
  return ROTULOS[tipo] ?? "—";
}

/**
 * "5 veículos", "1 veículo".
 *
 * Onde a contagem pode incluir moto, o rótulo deixa de dizer "carros". A loja
 * é de carros, mas o pátio nem sempre.
 */
export function veiculos(n: number): string {
  return `${n} ${n === 1 ? "veículo" : "veículos"}`;
}

/**
 * Como um veículo se identifica numa lista de escolha.
 *
 * Nome, ano, cor e placa — nessa ordem, que é a de quem procura: reconhece o
 * carro, confirma pelo ano e pela cor, e só olha a placa se ainda restar
 * dúvida. Marca e modelo sozinhos não bastam: a loja teve dois Hyundai HB20
 * no pátio ao mesmo tempo, e no seletor eram duas linhas idênticas.
 *
 * Ano e cor podem faltar em carro recebido às pressas; o que falta não deixa
 * um separador solto para trás.
 */
export function identificacao(
  v: { marca: string; modelo: string; ano: number | null; cor: string; placa: string },
): string {
  const nome = `${v.marca} ${v.modelo}${v.ano ? ` ${v.ano}` : ""}`;
  const cor = v.cor.trim();
  return [nome, cor && cor !== "—" ? cor : null, v.placa]
    .filter(Boolean)
    .join(" · ");
}
