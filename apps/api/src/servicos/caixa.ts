/**
 * Caixa — §4.7 e §3.6.
 *
 * Toda saída passa por aqui, e toda saída valida saldo antes de gravar. É a
 * "integração obrigatória" da §4.7: quem lança custo, compra ou venda escolhe
 * uma conta ou escolhe "Não descontar do caixa", e no primeiro caso nasce o
 * `movimento_caixa` correspondente.
 *
 * `contaId` nulo significa exatamente a opção "Não descontar do caixa", que a
 * especificação manda deixar em primeiro lugar no seletor. Não é ausência de
 * dado: é uma escolha.
 */

import type { PoolClient } from "pg";
import { deNumeric, paraNumeric, type Centavos } from "../dominio/dinheiro.js";
import {
  ErroDeValidacao, MSG, NaoEncontrado, saldoInsuficiente, saldoNaoDesfazTransferencia,
} from "../dominio/mensagens.js";
import type { DataISO } from "../dominio/veiculo.js";
import { registrarEvento } from "./eventos.js";

export type TipoMovimento =
  | "aporte" | "retirada" | "compra" | "custo" | "venda" | "transferencia";

export interface Conta {
  id: string;
  nome: string;
  tipo: "empresa" | "socio";
  socioId: string | null;
  saldo: Centavos;
}

export async function saldoDaConta(c: PoolClient, contaId: string): Promise<Conta> {
  const { rows } = await c.query<{
    id: string; nome: string; tipo: "empresa" | "socio"; socio_id: string | null; saldo: string;
  }>(
    `select c.id, c.nome, c.tipo, c.socio_id,
            c.saldo_inicial + coalesce(sum(m.valor), 0) as saldo
       from conta c
       left join movimento_caixa m on m.conta_id = c.id
      where c.id = $1
      group by c.id`,
    [contaId],
  );
  const conta = rows[0];
  if (!conta) throw new NaoEncontrado("Conta não encontrada.");
  return {
    id: conta.id, nome: conta.nome, tipo: conta.tipo,
    socioId: conta.socio_id, saldo: deNumeric(conta.saldo)!,
  };
}

export interface Movimento {
  contaId: string;
  data: DataISO;
  descricao: string;
  tipo: TipoMovimento;
  /** Com sinal: negativo é saída. */
  valor: Centavos;
  veiculoId?: string | null;
  custoId?: string | null;
  /** Une as duas pernas de uma transferência. Nulo em todo o resto. */
  transferenciaId?: string | null;
}

/**
 * Grava um movimento, validando saldo quando é saída.
 *
 * A validação e a gravação acontecem dentro da mesma transação do chamador,
 * com o saldo lido depois de um `select ... for update` na conta — sem isso,
 * dois lançamentos simultâneos poderiam passar cada um vendo o saldo antes do
 * outro e derrubar a conta para o negativo. São três usuários, mas a corrida
 * custa uma linha de SQL para fechar.
 */
export async function registrarMovimento(c: PoolClient, m: Movimento): Promise<string> {
  if (m.valor === 0) throw new ErroDeValidacao("Movimento de caixa não pode ser zero.");

  await c.query("select id from conta where id = $1 for update", [m.contaId]);
  const conta = await saldoDaConta(c, m.contaId);

  if (m.valor < 0 && conta.saldo + m.valor < 0) {
    throw new ErroDeValidacao(saldoInsuficiente(conta.nome, conta.saldo));
  }

  const { rows } = await c.query<{ id: string }>(
    `insert into movimento_caixa
       (conta_id, data, descricao, tipo, valor, veiculo_id, custo_id, transferencia_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [m.contaId, m.data, m.descricao, m.tipo, paraNumeric(m.valor),
     m.veiculoId ?? null, m.custoId ?? null, m.transferenciaId ?? null],
  );
  return rows[0]!.id;
}

/** Atalho para quando a conta é opcional — "Não descontar do caixa" (§4.7). */
export async function registrarMovimentoOpcional(
  c: PoolClient, contaId: string | null, m: Omit<Movimento, "contaId">,
): Promise<string | null> {
  if (!contaId) return null;
  return registrarMovimento(c, { ...m, contaId });
}

/**
 * Refaz o movimento de um veículo depois de uma edição — §4.8.
 *
 * "Ao alterar esses valores, atualize os movimento_caixa vinculados — senão o
 * extrato passa a contar história diferente da ficha." Apagar e regravar, em
 * vez de `update`, porque a conta pode ter mudado junto com o valor, e a
 * validação de saldo precisa rodar de novo com o número novo.
 */
export async function refazerMovimentoDoVeiculo(
  c: PoolClient,
  veiculoId: string,
  tipo: Extract<TipoMovimento, "compra" | "venda">,
  novo: Omit<Movimento, "veiculoId" | "custoId" | "tipo"> | null,
): Promise<void> {
  await c.query(
    "delete from movimento_caixa where veiculo_id = $1 and tipo = $2 and custo_id is null",
    [veiculoId, tipo],
  );
  if (novo) await registrarMovimento(c, { ...novo, tipo, veiculoId });
}

// ------------------------------------------------------------------- aportes

export interface Aporte {
  socioId: string;
  contaId: string;
  data: DataISO;
  tipo: "aporte" | "retirada";
  /** Sempre positivo; o tipo define o sinal. */
  valor: Centavos;
  observacao?: string | null;
}

/**
 * Um aporte gera duas linhas — §3.6.
 *
 * "Um `movimento_caixa` (o dinheiro entrou) e um `aporte_socio` (a
 * participação aumentou)." São números diferentes e ambos importam: o Ricardo
 * pode ter pouco em mãos e muito aportado ao longo do tempo.
 */
export async function registrarAporte(
  c: PoolClient, a: Aporte, usuarioId: string | null = null,
): Promise<string> {
  if (a.valor <= 0) throw new ErroDeValidacao("O valor do aporte precisa ser maior que zero.");

  const { rows: socio } = await c.query<{ nome: string }>(
    "select nome from usuario where id = $1", [a.socioId]);
  if (!socio[0]) throw new NaoEncontrado("Sócio não encontrado.");

  const sinal = a.tipo === "aporte" ? 1 : -1;
  const movimentoId = await registrarMovimento(c, {
    contaId: a.contaId,
    data: a.data,
    descricao: a.tipo === "aporte" ? `Aporte de ${socio[0].nome}` : `Retirada de ${socio[0].nome}`,
    tipo: a.tipo,
    valor: sinal * a.valor,
  });

  const { rows } = await c.query<{ id: string }>(
    `insert into aporte_socio (socio_id, conta_id, movimento_id, data, tipo, valor, observacao)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [a.socioId, a.contaId, movimentoId, a.data, a.tipo, paraNumeric(a.valor),
     a.observacao ?? null],
  );

  await registrarEvento(c, usuarioId, "aporte_socio", rows[0]!.id, "criou", null,
    { socio: socio[0].nome, tipo: a.tipo, valor: a.valor, data: a.data });

  return rows[0]!.id;
}

// ------------------------------------------------------------ transferência

export interface Transferencia {
  origemId: string;
  destinoId: string;
  data: DataISO;
  /** Sempre positivo; o sentido vem de origem e destino. */
  valor: Centavos;
  observacao?: string | null;
}

export interface ResultadoTransferencia {
  id: string;
  origem: { nome: string; saldo: Centavos };
  destino: { nome: string; saldo: Centavos };
  valor: Centavos;
}

/**
 * Remaneja dinheiro entre duas contas.
 *
 * Duas linhas no extrato, não uma: cada conta tem o seu extrato, e uma linha
 * só apareceria em uma delas. Elas compartilham um `transferencia_id` para
 * que o par seja um fato no banco, e não uma coincidência de data e valor.
 *
 * Não é aporte nem retirada. O dinheiro não entrou nem saiu da empresa — só
 * mudou de bolso —, então `capital_socio` não se mexe. Confundir os dois faria
 * o capital de um sócio crescer sozinho a cada remanejamento.
 *
 * O saldo da origem é validado por `registrarMovimento`, e a saída é gravada
 * primeiro justamente por isso: se não há saldo, nada acontece.
 */
export async function transferir(
  c: PoolClient, t: Transferencia, usuarioId: string | null = null,
): Promise<ResultadoTransferencia> {
  if (t.valor <= 0) throw new ErroDeValidacao(MSG.transferenciaSemValor);
  if (t.origemId === t.destinoId) throw new ErroDeValidacao(MSG.transferenciaMesmaConta);

  // Trava sempre na mesma ordem, senão duas transferências cruzadas entre as
  // mesmas contas travam uma na outra.
  for (const id of [t.origemId, t.destinoId].sort()) {
    await c.query("select id from conta where id = $1 for update", [id]);
  }

  const origem = await saldoDaConta(c, t.origemId);
  const destino = await saldoDaConta(c, t.destinoId);

  const { rows: par } = await c.query<{ id: string }>("select gen_random_uuid() as id");
  const transferenciaId = par[0]!.id;
  const sufixo = t.observacao?.trim() ? ` · ${t.observacao.trim()}` : "";

  await registrarMovimento(c, {
    contaId: t.origemId, data: t.data, tipo: "transferencia", valor: -t.valor,
    descricao: `Transferência para ${destino.nome}${sufixo}`, transferenciaId,
  });
  await registrarMovimento(c, {
    contaId: t.destinoId, data: t.data, tipo: "transferencia", valor: t.valor,
    descricao: `Transferência de ${origem.nome}${sufixo}`, transferenciaId,
  });

  await registrarEvento(c, usuarioId, "movimento_caixa", transferenciaId, "transferiu", null,
    { origem: origem.nome, destino: destino.nome, valor: t.valor, data: t.data });

  return {
    id: transferenciaId,
    origem: { nome: origem.nome, saldo: origem.saldo - t.valor },
    destino: { nome: destino.nome, saldo: destino.saldo + t.valor },
    valor: t.valor,
  };
}

export interface PreviaExclusaoTransferencia {
  id: string;
  data: DataISO;
  valor: Centavos;
  origem: { nome: string; saldoAtual: Centavos; fica: Centavos };
  destino: { nome: string; saldoAtual: Centavos; fica: Centavos };
  /** Preenchido quando não dá para apagar, com o motivo. */
  impedimento: string | null;
}

/** As duas pernas de uma transferência, lidas pelo par. */
async function pernasDa(
  c: PoolClient, transferenciaId: string,
): Promise<{ conta: string; valor: Centavos; saldo: Centavos; data: DataISO }[]> {
  const { rows } = await c.query<
    { conta: string; valor: string; saldo: string; data: DataISO }
  >(`select ct.nome as conta, m.valor, s.saldo, m.data
       from movimento_caixa m
       join conta ct on ct.id = m.conta_id
       join saldo_conta s on s.conta_id = m.conta_id
      where m.transferencia_id = $1
      order by m.valor`, [transferenciaId]);

  return rows.map((r) => ({
    conta: r.conta, valor: deNumeric(r.valor)!, saldo: deNumeric(r.saldo)!, data: r.data,
  }));
}

/**
 * O que apagar uma transferência vai mexer.
 *
 * Só o destino corre risco: apagar a entrada dele tira o dinheiro de volta, e
 * ele pode já ter gasto. Na origem a saída é apagada e o dinheiro volta, o que
 * nunca derruba saldo.
 */
export async function previaExclusaoTransferencia(
  c: PoolClient, id: string,
): Promise<PreviaExclusaoTransferencia> {
  const pernas = await pernasDa(c, id);
  if (pernas.length !== 2) throw new NaoEncontrado(MSG.transferenciaNaoEncontrada);

  // `order by m.valor`: a saída é negativa e vem primeiro.
  const [saida, entrada] = pernas as [typeof pernas[0], typeof pernas[0]];
  const valor = entrada.valor;

  const ficaNoDestino = entrada.saldo - valor;
  return {
    id,
    data: entrada.data,
    valor,
    origem: { nome: saida.conta, saldoAtual: saida.saldo, fica: saida.saldo + valor },
    destino: { nome: entrada.conta, saldoAtual: entrada.saldo, fica: ficaNoDestino },
    impedimento: ficaNoDestino < 0
      ? saldoNaoDesfazTransferencia(entrada.conta, entrada.saldo, valor)
      : null,
  };
}

/**
 * Apaga as duas pernas de uma transferência.
 *
 * As duas juntas, sempre: meia transferência é dinheiro sumindo ou nascendo.
 * Não é estorno — não deixa rastro no extrato —, porque uma transferência
 * lançada errada é erro de digitação, não fato do negócio. Quem precisa do
 * histórico tem a tabela `evento`, que registra o que foi apagado.
 */
export async function excluirTransferencia(
  c: PoolClient, id: string, usuarioId: string | null = null,
): Promise<PreviaExclusaoTransferencia> {
  // Trava as duas contas antes de ler saldo, na mesma ordem de `transferir`.
  const { rows: contas } = await c.query<{ conta_id: string }>(
    "select distinct conta_id from movimento_caixa where transferencia_id = $1 order by conta_id",
    [id]);
  for (const { conta_id } of contas) {
    await c.query("select id from conta where id = $1 for update", [conta_id]);
  }

  const previa = await previaExclusaoTransferencia(c, id);
  if (previa.impedimento) throw new ErroDeValidacao(previa.impedimento);

  await c.query("delete from movimento_caixa where transferencia_id = $1", [id]);

  await registrarEvento(c, usuarioId, "movimento_caixa", id, "excluiu", {
    origem: previa.origem.nome, destino: previa.destino.nome,
    valor: previa.valor, data: previa.data,
  }, null);

  return previa;
}
