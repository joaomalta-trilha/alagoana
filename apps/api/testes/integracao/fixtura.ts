/**
 * O mínimo para um teste rodar: um usuário e duas contas.
 *
 * Cada arquivo limpa antes de cada caso. É mais lento que reaproveitar, e é o
 * que garante que um teste não passe por causa do lixo do anterior.
 */

import { pool } from "../../src/db/conexao.js";
import { paraNumeric, deNumeric, type Centavos } from "../../src/dominio/dinheiro.js";

export interface Base {
  usuarioId: string;
  /** Conta da empresa. */
  alagoana: string;
  /** Conta de sócio, do João. */
  joao: string;
}

/** `categoria_custo` e `migracao` ficam: são estrutura, não dado de teste. */
export async function limpar(): Promise<void> {
  await pool.query(`
    truncate evento, aporte_socio, movimento_caixa, custo, veiculo,
             conta, usuario, sessao, marca, modelo, cor, config
    restart identity cascade`);
}

export async function base(
  saldoEmpresa: Centavos = 10_000_000, saldoSocio: Centavos = 0,
): Promise<Base> {
  const { rows: usuario } = await pool.query<{ id: string }>(
    `insert into usuario (nome, email) values ('João', 'joao@teste.local') returning id`);
  const usuarioId = usuario[0]!.id;

  const { rows: empresa } = await pool.query<{ id: string }>(
    `insert into conta (nome, tipo, saldo_inicial) values ('Alagoana', 'empresa', $1)
     returning id`, [paraNumeric(saldoEmpresa)]);

  const { rows: socio } = await pool.query<{ id: string }>(
    `insert into conta (nome, tipo, socio_id, saldo_inicial) values ('João', 'socio', $1, $2)
     returning id`, [usuarioId, paraNumeric(saldoSocio)]);

  return { usuarioId, alagoana: empresa[0]!.id, joao: socio[0]!.id };
}

export async function saldo(contaId: string): Promise<Centavos> {
  const { rows } = await pool.query<{ saldo: string }>(
    "select saldo from saldo_conta where conta_id = $1", [contaId]);
  return deNumeric(rows[0]!.saldo)!;
}

export async function contarMovimentos(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("select count(*) n from movimento_caixa");
  return Number(rows[0]!.n);
}
