/**
 * Categorias de custo — §3.7.
 *
 * Lista fechada, nesta ordem exata. Esta constante é a fonte de verdade; a
 * migração `0002_categoria_custo.sql` grava a mesma coisa no banco e
 * `db:conferir` acusa se as duas divergirem.
 *
 * Duas categorias têm regra própria:
 *   Retorno        só em veículo já vendido (§4.4 — custo de garantia)
 *   Não detalhado  não aparece no seletor; existe só para a carga inicial dos
 *                  três carros que a planilha não detalhou (§9)
 */

export interface CategoriaCusto {
  readonly nome: string;
  readonly selecionavel: boolean;
  readonly exigeVendido: boolean;
}

const simples = (nome: string): CategoriaCusto =>
  ({ nome, selecionavel: true, exigeVendido: false });

export const CATEGORIAS_CUSTO: readonly CategoriaCusto[] = [
  simples("Combustível"),
  simples("Transferência"),
  simples("Consulta"),
  simples("Peças"),
  simples("Pintura"),
  simples("Polimento"),
  simples("Reparo"),
  simples("Manutenção"),
  simples("Revisão"),
  simples("Serviço"),
  simples("Guincho"),
  simples("IPVA"),
  simples("Imposto"),
  simples("Amarelinha"),
  simples("Cautelar"),
  simples("Bateria"),
  simples("Chaveiro"),
  simples("Lâmpada"),
  simples("Patrocinado"),
  simples("Comissão"),
  { nome: "Retorno", selecionavel: true, exigeVendido: true },
  simples("Troca"),
  { nome: "Não detalhado", selecionavel: false, exigeVendido: false },
];

export const NOMES_CATEGORIA: readonly string[] = CATEGORIAS_CUSTO.map((c) => c.nome);

const PORCATEGORIA = new Map(CATEGORIAS_CUSTO.map((c) => [c.nome, c]));

export function acharCategoria(nome: string): CategoriaCusto | undefined {
  return PORCATEGORIA.get(nome);
}

/**
 * O que o seletor da interface oferece para um veículo.
 *
 * `Não detalhado` some sempre; `Retorno` só aparece quando o carro já foi
 * vendido. A mensagem de recusa correspondente está na §8: "Retorno só pode
 * ser lançado em carro já vendido."
 */
export function categoriasSelecionaveis(vendido: boolean): readonly CategoriaCusto[] {
  return CATEGORIAS_CUSTO.filter((c) => c.selecionavel && (vendido || !c.exigeVendido));
}
