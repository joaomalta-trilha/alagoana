/**
 * Trilha de auditoria — a tabela `evento` do schema.
 *
 * Append-only, e gravada dentro da mesma transação da mudança: ou o veículo
 * mudou e o evento existe, ou nada aconteceu. A planilha que este sistema
 * substitui tinha histórico de versões; sem isto, três pessoas editando os
 * mesmos números seria uma regressão.
 */

import type { PoolClient } from "pg";

export type Acao = "criou" | "editou" | "excluiu" | "vendeu";

export async function registrarEvento(
  c: PoolClient,
  usuarioId: string | null,
  entidade: string,
  entidadeId: string | null,
  acao: Acao,
  antes: unknown = null,
  depois: unknown = null,
): Promise<void> {
  await c.query(
    `insert into evento (usuario_id, entidade, entidade_id, acao, antes, depois)
     values ($1, $2, $3, $4, $5, $6)`,
    [usuarioId, entidade, entidadeId, acao,
     antes === null ? null : JSON.stringify(antes),
     depois === null ? null : JSON.stringify(depois)],
  );
}
