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
