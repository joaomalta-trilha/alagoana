/**
 * Custo — o coração do sistema (§3.4).
 *
 * "Cada gasto é uma linha; nunca um campo agregado no veículo." Custo total é
 * sempre soma, nunca um número guardado que pode envelhecer.
 *
 * O rateio existe porque o custo de tráfego pago é dividido entre os carros
 * anunciados: em 01/08/2026 o mesmo valor de R$ 369,46 foi lançado em três
 * veículos (§6.7).
 */

import type { PoolClient } from "pg";
import { deNumeric, paraNumeric, ratear, type Centavos } from "../dominio/dinheiro.js";
import { acharCategoria } from "../dominio/categorias.js";
import { ErroDeValidacao, MSG, NaoEncontrado } from "../dominio/mensagens.js";
import type { DataISO } from "../dominio/veiculo.js";
import { registrarEvento } from "./eventos.js";
import { registrarMovimentoOpcional } from "./caixa.js";

export type ModoRateio = "mesmo" | "dividir";

export interface EntradaCusto {
  /** Um ou vários: o rateio da §6.7 é o caso de vários. */
  veiculoIds: string[];
  descricao: string;
  categoria: string;
  data: DataISO | null;
  valor: Centavos;
  /** `mesmo` repete o valor em cada carro; `dividir` reparte entre eles. */
  modoRateio?: ModoRateio;
  /** Custo previsto (§3.4): sem data, ainda não realizado. */
  previsto?: boolean;
  /** Nulo = "Não descontar do caixa" (§4.7). */
  contaId?: string | null;
}

export interface CustoLancado {
  id: string;
  veiculoId: string;
  codigo: string;
  valor: Centavos;
  movimentoId: string | null;
}

export async function lancarCusto(
  c: PoolClient, e: EntradaCusto, usuarioId: string | null,
): Promise<CustoLancado[]> {
  const ids = [...new Set(e.veiculoIds ?? [])];
  if (ids.length === 0) throw new ErroDeValidacao(MSG.rateioSemSelecao);

  const descricao = (e.descricao ?? "").trim();
  const semData = e.data === null || e.data === undefined || e.data === "";
  // A §8 pede data preenchida no lançamento; o custo previsto da §3.4 é a
  // exceção, e precisa ser pedida de propósito.
  if (!descricao || !e.valor || e.valor <= 0 || (semData && !e.previsto)) {
    throw new ErroDeValidacao(MSG.custoIncompleto);
  }

  const categoria = acharCategoria(e.categoria);
  if (!categoria) throw new ErroDeValidacao(`Categoria desconhecida: ${e.categoria}.`);
  if (!categoria.selecionavel) {
    throw new ErroDeValidacao(`${categoria.nome} não pode ser lançada — existe só para a carga inicial.`);
  }

  const { rows: veiculos } = await c.query<{
    id: string; codigo: string; marca: string; modelo: string; data_venda: string | null;
  }>(
    `select id, codigo, marca, modelo, data_venda from veiculo where id = any($1::uuid[])
      order by codigo`, [ids]);
  if (veiculos.length !== ids.length) throw new NaoEncontrado("Veículo não encontrado.");

  if (categoria.exigeVendido && veiculos.some((v) => v.data_venda === null)) {
    throw new ErroDeValidacao(MSG.retornoEmPatio);
  }

  // "dividir" reparte sem perder centavo; "mesmo" repete o valor em cada carro.
  const valores = (e.modoRateio ?? "mesmo") === "dividir"
    ? ratear(e.valor, veiculos.length)
    : veiculos.map(() => e.valor);

  const data = semData ? null : e.data;
  const lancados: CustoLancado[] = [];

  for (const [i, v] of veiculos.entries()) {
    const valor = valores[i]!;
    const { rows } = await c.query<{ id: string }>(
      `insert into custo (veiculo_id, descricao, categoria, data, valor)
       values ($1, $2, $3, $4, $5) returning id`,
      [v.id, descricao, categoria.nome, data, paraNumeric(valor)]);
    const custoId = rows[0]!.id;

    // Custo previsto não tira dinheiro do caixa — ainda não aconteceu.
    const movimentoId = data === null ? null : await registrarMovimentoOpcional(
      c, e.contaId ?? null, {
        data,
        descricao: `${descricao} · ${v.codigo}`,
        tipo: "custo",
        valor: -valor,
        veiculoId: v.id,
        custoId,
      });

    lancados.push({ id: custoId, veiculoId: v.id, codigo: v.codigo, valor, movimentoId });
  }

  await registrarEvento(c, usuarioId, "custo", lancados[0]?.id ?? null, "criou", null, {
    descricao, categoria: categoria.nome, data,
    veiculos: veiculos.map((v) => v.codigo), valores,
  });

  return lancados;
}

/**
 * Exclui o custo e devolve o valor ao saldo — §4.8.
 *
 * A devolução é o `on delete cascade` de `movimento_caixa.custo_id`: some a
 * linha do extrato, e o saldo, que é sempre calculado, sobe de volta sozinho.
 */
export async function excluirCusto(
  c: PoolClient, id: string, usuarioId: string | null,
): Promise<{ valor: Centavos; devolvidoAoCaixa: Centavos; veiculoId: string }> {
  const { rows } = await c.query<{
    veiculo_id: string; descricao: string; categoria: string; valor: string;
  }>("select veiculo_id, descricao, categoria, valor from custo where id = $1 for update", [id]);
  const custo = rows[0];
  if (!custo) throw new NaoEncontrado("Custo não encontrado.");

  const { rows: movimentos } = await c.query<{ soma: string }>(
    "select coalesce(sum(valor), 0) soma from movimento_caixa where custo_id = $1", [id]);

  await c.query("delete from custo where id = $1", [id]);

  await registrarEvento(c, usuarioId, "custo", id, "excluiu",
    { descricao: custo.descricao, categoria: custo.categoria, valor: custo.valor }, null);

  return {
    valor: deNumeric(custo.valor)!,
    devolvidoAoCaixa: -deNumeric(movimentos[0]!.soma)!,
    veiculoId: custo.veiculo_id,
  };
}

export interface Atalho {
  descricao: string;
  categoria: string;
  repeticoes: number;
  valor: Centavos;
}

/**
 * Os oito atalhos do lançamento rápido — §6.7.
 *
 * "Agrupa lançamentos por descrição + categoria, conta repetições, sugere os
 * oito mais frequentes com o valor mais comum." `mode()` é exatamente "o valor
 * mais comum" — a média mentiria num conjunto com um outlier, e o último valor
 * mentiria quando o último foi a exceção.
 */
export async function atalhos(c: PoolClient, quantos = 8): Promise<Atalho[]> {
  const { rows } = await c.query<{
    descricao: string; categoria: string; n: string; valor: string;
  }>(
    `select descricao, categoria, count(*) as n,
            mode() within group (order by valor) as valor
       from custo
      where categoria <> 'Não detalhado'
      group by descricao, categoria
     having count(*) > 1
      order by count(*) desc, max(criado_em) desc
      limit $1`,
    [quantos]);

  return rows.map((r) => ({
    descricao: r.descricao,
    categoria: r.categoria,
    repeticoes: Number(r.n),
    valor: deNumeric(r.valor)!,
  }));
}
