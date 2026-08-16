/**
 * Os filtros do desktop — §6.1.
 *
 * "Os filtros do desktop afetam todas as telas simultaneamente." Por isso eles
 * moram aqui, no domínio, e são aplicados uma vez na listagem de veículos —
 * painel e vendas saem dela e herdam o recorte de graça. Se cada tela filtrasse
 * por conta própria, uma acabaria filtrando diferente.
 *
 * As três regras são as do protótipo, sem reinterpretação.
 */

import type { Centavos } from "./dinheiro.js";
import { diasEntre, type DataISO } from "./veiculo.js";

export type FaixaPreco = "a" | "b" | "c";

/** Os cortes da §6.1: até 60 mil, de 60 a 100 mil, acima de 100 mil. */
export const CORTE_BAIXO: Centavos = 6_000_000;
export const CORTE_ALTO: Centavos = 10_000_000;

export interface Filtros {
  /** Janela em dias, contada para trás a partir de hoje. Nulo = tudo. */
  periodoDias: number | null;
  marca: string | null;
  faixa: FaixaPreco | null;
}

export const SEM_FILTRO: Filtros = { periodoDias: null, marca: null, faixa: null };

export function algumFiltroAtivo(f: Filtros): boolean {
  return f.periodoDias !== null || f.marca !== null || f.faixa !== null;
}

interface Filtravel {
  marca: string;
  dataCompra: DataISO;
  dataVenda: DataISO | null;
  valorCompra: Centavos;
  valorVenda: Centavos | null;
  valorAnuncio: Centavos | null;
}

/**
 * O preço que representa o carro na faixa.
 *
 * Vendido responde pelo que saiu; em estoque, pelo que se pede; e, sem anúncio,
 * pelo que se pagou. É a ordem que responde "quanto vale este carro" com o
 * dado mais recente que existe.
 */
export function precoDeReferencia(v: Filtravel): Centavos {
  return v.valorVenda ?? v.valorAnuncio ?? v.valorCompra;
}

export function naFaixa(v: Filtravel, faixa: FaixaPreco | null): boolean {
  if (faixa === null) return true;
  const preco = precoDeReferencia(v);
  if (faixa === "a") return preco < CORTE_BAIXO;
  if (faixa === "b") return preco >= CORTE_BAIXO && preco <= CORTE_ALTO;
  return preco > CORTE_ALTO;
}

/**
 * A data que conta é a do fato mais recente: a venda, se houve; a compra, se
 * o carro ainda está no pátio.
 */
export function noPeriodo(v: Filtravel, periodoDias: number | null, hoje: DataISO): boolean {
  if (periodoDias === null) return true;
  return diasEntre(v.dataVenda ?? v.dataCompra, hoje) <= periodoDias;
}

export function passaNosFiltros(v: Filtravel, f: Filtros, hoje: DataISO): boolean {
  return noPeriodo(v, f.periodoDias, hoje) &&
    naFaixa(v, f.faixa) &&
    (f.marca === null || v.marca === f.marca);
}

/** Lê os filtros da query string, ignorando o que não fizer sentido. */
export function lerFiltros(consulta: URLSearchParams): Filtros {
  const periodo = Number(consulta.get("periodo"));
  const faixa = consulta.get("faixa");
  return {
    periodoDias: Number.isInteger(periodo) && periodo > 0 ? periodo : null,
    marca: consulta.get("marca")?.trim() || null,
    faixa: faixa === "a" || faixa === "b" || faixa === "c" ? faixa : null,
  };
}
