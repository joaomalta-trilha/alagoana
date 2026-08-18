/**
 * As fórmulas da seção 4 da especificação.
 *
 * Tudo aqui é função pura: entra número, sai número. Nada conhece banco,
 * HTTP ou React. É o que permite testar cada exemplo numérico do documento
 * sem subir infraestrutura — e é o único lugar do sistema onde essas contas
 * existem, para que painel, ficha e API nunca divirjam.
 */

import type { Centavos } from "./dinheiro.js";

/** Data de negócio no formato ISO, sem hora e sem fuso. */
export type DataISO = string; // 'AAAA-MM-DD'

export const DIA_MS = 86_400_000;

/** Diferença em dias entre duas datas de negócio. */
export function diasEntre(inicio: DataISO, fim: DataISO): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / DIA_MS);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 4.1 custo

export function custoTotal(valorCompra: Centavos, custoPreparacao: Centavos): Centavos {
  return valorCompra + custoPreparacao;
}

export function lucro(valorVenda: Centavos, custoTotal: Centavos): Centavos {
  return valorVenda - custoTotal;
}

/**
 * Retorno sobre o INVESTIDO, não sobre a venda.
 *
 * É como a planilha da loja sempre calculou e é o número que os sócios
 * reconhecem. Conferência: Honda City 3.146,80 / 93.853,20 = 3,35%.
 */
export function retornoPct(lucro: Centavos, custoTotal: Centavos): number {
  if (custoTotal === 0) return 0;
  return (lucro / custoTotal) * 100;
}

/** Vendido: da compra à venda. Em estoque: da compra até hoje. */
export function cicloDias(dataCompra: DataISO, dataVenda: DataISO | null, hoje: DataISO): number {
  return diasEntre(dataCompra, dataVenda ?? hoje);
}

/** Abaixo de 15 dias o número explode e engana; nesse caso devolve null. */
export const CICLO_MINIMO_PARA_RETORNO_MENSAL = 15;

export function retornoMes(retornoPct: number, cicloDias: number): number | null {
  if (cicloDias < CICLO_MINIMO_PARA_RETORNO_MENSAL) return null;
  return retornoPct / (cicloDias / 30);
}

export function lucroProjetado(valorAnuncio: Centavos | null, custoTotal: Centavos): Centavos | null {
  return valorAnuncio === null ? null : valorAnuncio - custoTotal;
}

/**
 * Quanto se cedeu do preço pedido na hora de fechar.
 *
 * Negativo é desconto — o caso comum. Positivo é ter vendido acima do
 * anúncio, que acontece pouco mas acontece. Fica separado do lucro de
 * propósito: o lucro diz o resultado, este número diz de onde ele veio.
 *
 * Nulo enquanto faltar a venda ou o anúncio; sem os dois não há o que comparar.
 */
export function descontoNoFechamento(
  valorVenda: Centavos | null, valorAnuncio: Centavos | null,
): Centavos | null {
  if (valorVenda === null || valorAnuncio === null) return null;
  return valorVenda - valorAnuncio;
}

// ----------------------------------------------------------------- 4.2 fipe

export function depreciacao(fipeCompra: Centavos | null, fipeHoje: Centavos | null): Centavos | null {
  if (fipeCompra === null || fipeHoje === null) return null;
  return fipeHoje - fipeCompra;
}

export function depreciacaoPct(fipeCompra: Centavos | null, fipeHoje: Centavos | null): number | null {
  const dep = depreciacao(fipeCompra, fipeHoje);
  if (dep === null || fipeCompra === 0 || fipeCompra === null) return null;
  return (dep / fipeCompra) * 100;
}

export function anuncioVsFipe(valorAnuncio: Centavos | null, fipeHoje: Centavos | null): number | null {
  if (valorAnuncio === null || !fipeHoje) return null;
  return (valorAnuncio / fipeHoje - 1) * 100;
}

// ------------------------------------------------------- 4.3 envelhecimento

export type FaixaIdade = "0-30" | "31-60" | "61-90" | "90+";

export const CORES_FAIXA: Record<FaixaIdade, string> = {
  "0-30": "#2A8466",
  "31-60": "#7FA83C",
  "61-90": "#D89A2B",
  "90+": "#B94B45",
};

export function faixaIdade(cicloDias: number): FaixaIdade {
  if (cicloDias <= 30) return "0-30";
  if (cicloDias <= 60) return "31-60";
  if (cicloDias <= 90) return "61-90";
  return "90+";
}

/** Percentual da barra de dias em pátio, saturando em 120 dias. */
export function preenchimentoIdade(cicloDias: number): number {
  return Math.min(100, (cicloDias / 120) * 100);
}

// -------------------------------------------------------------- 4.4 garantia

export const DIAS_GARANTIA = 90;

export interface Garantia {
  fim: DataISO;
  diasRestantes: number;
  ativa: boolean;
  preenchimento: number;
}

export function garantia(dataVenda: DataISO, hoje: DataISO): Garantia {
  const fim = somarDias(dataVenda, DIAS_GARANTIA);
  const diasRestantes = diasEntre(hoje, fim);
  return {
    fim,
    diasRestantes,
    ativa: diasRestantes > 0,
    preenchimento: Math.max(0, Math.min(100, ((DIAS_GARANTIA - diasRestantes) / DIAS_GARANTIA) * 100)),
  };
}

// ----------------------------------------------------------------- 4.5 troca

export type ModoTroca = "avaliacao" | "mercado";

export interface ResultadoTroca {
  /** Valor de compra do veículo que entra. */
  valorCompraEntrada: Centavos;
  /** Ágio, quando a avaliação ficou acima do mercado. Zero caso contrário. */
  agio: Centavos;
  /** Custo de categoria Troca a lançar no veículo vendido. Zero se não houver. */
  custoAgioNoVendido: Centavos;
  /** O que efetivamente entrou em dinheiro. Pode ser negativo. */
  entradaEmCaixa: Centavos;
}

/**
 * As três coisas que acontecem numa venda com troca, em uma transação só.
 *
 * O caixa recebe `valor_venda − avaliacao_troca` nos dois modos: a escolha
 * do modo move o resultado entre os dois carros, nunca o dinheiro.
 * Conferência: Tracker vendido a 89.000 com custo 71.183,46, recebendo um
 * Argo avaliado em 44.000 e valendo 40.000 — caixa 45.000 em ambos.
 */
export function calcularTroca(
  valorVenda: Centavos,
  avaliacaoTroca: Centavos,
  mercadoTroca: Centavos | null,
  modo: ModoTroca,
): ResultadoTroca {
  const mercado = mercadoTroca ?? avaliacaoTroca;
  const agio = Math.max(0, avaliacaoTroca - mercado);
  const peloMercado = modo === "mercado" && agio > 0;
  return {
    valorCompraEntrada: peloMercado ? mercado : avaliacaoTroca,
    agio,
    custoAgioNoVendido: peloMercado ? agio : 0,
    entradaEmCaixa: valorVenda - avaliacaoTroca,
  };
}

export interface VeiculoDaTroca {
  avaliacao: Centavos;
  mercado?: Centavos | null;
  modo: ModoTroca;
}

export interface ResultadoTrocas {
  /** Um resultado por veículo recebido, na ordem em que vieram. */
  entradas: ResultadoTroca[];
  /** Soma das avaliações — o que deixou de entrar em dinheiro. */
  avaliacaoTotal: Centavos;
  /** Soma dos ágios, para exibição. */
  agioTotal: Centavos;
  /** Soma dos ágios que viram custo no carro vendido. */
  custoAgioNoVendido: Centavos;
  /** `valor_venda` menos a soma das avaliações. Pode ser negativo. */
  entradaEmCaixa: Centavos;
}

/**
 * A mesma conta da §4.5, para quantos veículos entrarem na troca.
 *
 * Numa venda pode entrar mais de um carro — dois carros, ou um carro e uma
 * moto. Cada um tem a sua avaliação, o seu valor de mercado e o seu modo, e
 * portanto o seu próprio ágio; o que o caixa recebe é a venda menos a soma
 * das avaliações.
 *
 * Com um veículo só, devolve exatamente o que `calcularTroca` devolvia — é o
 * que o caso do Tracker cobra, e a razão de a §4.5 não precisar mudar.
 */
export function calcularTrocas(
  valorVenda: Centavos,
  trocas: ReadonlyArray<VeiculoDaTroca>,
): ResultadoTrocas {
  const avaliacaoTotal = trocas.reduce((a, t) => a + t.avaliacao, 0);
  const entradas = trocas.map((t) =>
    calcularTroca(valorVenda, t.avaliacao, t.mercado ?? null, t.modo));

  return {
    entradas,
    avaliacaoTotal,
    agioTotal: entradas.reduce((a, e) => a + e.agio, 0),
    custoAgioNoVendido: entradas.reduce((a, e) => a + e.custoAgioNoVendido, 0),
    entradaEmCaixa: valorVenda - avaliacaoTotal,
  };
}

// ---------------------------------------------------- 4.7 caixa e patrimônio

export interface Patrimonio {
  caixaTotal: Centavos;
  estoqueCusto: Centavos;
  estoqueAnuncio: Centavos;
  patrimonioTotal: Centavos;
  lucroNaoRealizado: Centavos;
  patrimonioFuturo: Centavos;
}

export function patrimonio(
  caixaTotal: Centavos,
  estoque: ReadonlyArray<{ custoTotal: Centavos; valorAnuncio: Centavos | null }>,
): Patrimonio {
  const estoqueCusto = estoque.reduce((a, v) => a + v.custoTotal, 0);
  const estoqueAnuncio = estoque.reduce((a, v) => a + (v.valorAnuncio ?? v.custoTotal), 0);
  const patrimonioTotal = caixaTotal + estoqueCusto;
  const lucroNaoRealizado = estoqueAnuncio - estoqueCusto;
  return {
    caixaTotal,
    estoqueCusto,
    estoqueAnuncio,
    patrimonioTotal,
    lucroNaoRealizado,
    patrimonioFuturo: patrimonioTotal + lucroNaoRealizado,
  };
}
