/**
 * Tipo de veículo.
 *
 * O cadastro assumia que todo veículo é carro. Na prática entra moto na troca
 * — é o caso mais comum — e eventualmente reboque ou implemento.
 *
 * `outro` existe justamente para não ter catálogo: reboque, náutico e
 * implemento são exceção, e manter catálogo de exceção é criar uma lista que
 * ninguém rega. Ali marca e modelo são texto livre.
 */

export type TipoVeiculo = "carro" | "moto" | "outro";

export interface Tipo {
  readonly valor: TipoVeiculo;
  readonly rotulo: string;
  /** Tem catálogo de marca e modelo, ou é texto livre? */
  readonly temCatalogo: boolean;
  /** Aparece como etiqueta nas listagens? Carro é o padrão e não precisa. */
  readonly etiqueta: string | null;
}

export const TIPOS: readonly Tipo[] = [
  { valor: "carro", rotulo: "Carro", temCatalogo: true, etiqueta: null },
  { valor: "moto", rotulo: "Moto", temCatalogo: true, etiqueta: "moto" },
  { valor: "outro", rotulo: "Outros", temCatalogo: false, etiqueta: "outro" },
];

const PORVALOR = new Map(TIPOS.map((t) => [t.valor, t]));

export const TIPO_PADRAO: TipoVeiculo = "carro";

export function tipoValido(valor: unknown): valor is TipoVeiculo {
  return typeof valor === "string" && PORVALOR.has(valor as TipoVeiculo);
}

/** Lê o que veio de fora, caindo no padrão quando vier vazio. */
export function lerTipo(valor: unknown): TipoVeiculo {
  if (valor === null || valor === undefined || valor === "") return TIPO_PADRAO;
  if (!tipoValido(valor)) throw new Error(`Tipo de veículo inválido: ${String(valor)}`);
  return valor;
}

export function temCatalogo(tipo: TipoVeiculo): boolean {
  return PORVALOR.get(tipo)?.temCatalogo ?? false;
}

export function etiquetaDe(tipo: TipoVeiculo): string | null {
  return PORVALOR.get(tipo)?.etiqueta ?? null;
}

/** Os tipos que têm catálogo — os únicos que a tabela `marca` aceita. */
export type TipoComCatalogo = Extract<TipoVeiculo, "carro" | "moto">;
