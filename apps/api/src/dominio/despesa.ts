/**
 * Despesa da empresa — existe mesmo com o pátio vazio, ao contrário do custo
 * de veículo, que some quando o carro é vendido. As duas coisas não se
 * misturam em relatório nenhum.
 *
 * Sem o job de recorrência ainda (fica para a rodada 2), o formulário não tem
 * campo de status: a própria data de pagamento diz se já aconteceu.
 */

import type { DataISO } from "./veiculo.js";

export type StatusDespesa = "pago" | "previsto";

/** Data no passado ou hoje já aconteceu; no futuro, ainda é previsão. */
export function statusDaData(dataPagamento: DataISO, hoje: DataISO): StatusDespesa {
  return dataPagamento <= hoje ? "pago" : "previsto";
}
