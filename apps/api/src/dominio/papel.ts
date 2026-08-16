/**
 * Visão por papel — §5.
 *
 * Na v1 todo mundo é `master` e enxerga tudo. Isto existe porque a
 * especificação manda preparar as consultas para o filtro desde já: "quando
 * entrarem vendedores, a regra combinada é: vendedor vê estoque e cria venda,
 * mas não vê valor de compra, custos nem margem, e enxerga só as próprias
 * comissões."
 *
 * O filtro é aplicado na saída, num lugar só. A alternativa — cada consulta
 * lembrar de omitir suas colunas — é a que garante que um dia uma esquece.
 */

export type Papel = "master" | "vendedor";

export function veFinanceiro(papel: Papel): boolean {
  return papel === "master";
}

/**
 * O que some da ficha e das listagens para quem não vê financeiro.
 *
 * Note que `valorAnuncio` fica: é o preço pedido, que o vendedor precisa saber
 * para negociar. O que sai é tudo que revela a margem.
 */
export const CAMPOS_SEM_FINANCEIRO = [
  "valorCompra", "custoPreparacao", "custoTotal", "lucro", "retornoPct",
  "retornoMes", "lucroProjetado", "projetadoPct", "custos", "lancamentos",
  "fipeCompra", "fipeHoje", "depreciacao", "depreciacaoPct",
  "avaliacaoTroca", "mercadoTroca", "agioTroca",
] as const;

type SemFinanceiro<T> = Omit<T, (typeof CAMPOS_SEM_FINANCEIRO)[number]>;

export function filtrarPorPapel<T extends object>(registro: T, papel: Papel): T | SemFinanceiro<T> {
  if (veFinanceiro(papel)) return registro;
  const copia = { ...registro } as Record<string, unknown>;
  for (const campo of CAMPOS_SEM_FINANCEIRO) delete copia[campo];
  return copia as SemFinanceiro<T>;
}

export function filtrarListaPorPapel<T extends object>(
  registros: readonly T[], papel: Papel,
): (T | SemFinanceiro<T>)[] {
  return registros.map((r) => filtrarPorPapel(r, papel));
}
