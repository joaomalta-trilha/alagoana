/**
 * Despesa da empresa e plano de contas — pedido pela loja em 16/09/2026.
 *
 * Reaproveita o mecanismo de caixa que já existe: `registrarMovimento`
 * valida saldo e grava a saída do mesmo jeito para despesa, custo, venda ou
 * transferência. O que muda aqui é só de onde vem o dinheiro na ficha — de
 * uma conta do plano, não de um veículo.
 *
 * Status não é escolha na tela: nasce da data. Ver `dominio/despesa.ts`.
 */

import type { PoolClient } from "pg";
import { deNumeric, paraNumeric, type Centavos } from "../dominio/dinheiro.js";
import { statusDaData, type StatusDespesa } from "../dominio/despesa.js";
import { ErroDeValidacao, MSG, NaoEncontrado } from "../dominio/mensagens.js";
import type { DataISO } from "../dominio/veiculo.js";
import { registrarEvento } from "./eventos.js";
import { registrarMovimento } from "./caixa.js";

export interface ContaDoPlano {
  id: string;
  codigo: string;
  grupoCodigo: number;
  grupoNome: string;
  nome: string;
  natureza: "fixa" | "variavel";
  tipo: "operacional" | "retirada" | "nao_operacional";
  ativa: boolean;
}

/** Árvore completa, com inativas — é a tela de plano de contas que decide o que mostrar. */
export async function listarPlanoContas(c: PoolClient): Promise<ContaDoPlano[]> {
  const { rows } = await c.query<{
    id: string; codigo: string; grupo_codigo: number; grupo_nome: string; nome: string;
    natureza: "fixa" | "variavel"; tipo: "operacional" | "retirada" | "nao_operacional"; ativa: boolean;
  }>(
    `select id, codigo, grupo_codigo, grupo_nome, nome, natureza, tipo, ativa
       from plano_conta
      order by grupo_codigo, split_part(codigo, '.', 2)::int`);

  return rows.map((r) => ({
    id: r.id, codigo: r.codigo, grupoCodigo: r.grupo_codigo, grupoNome: r.grupo_nome,
    nome: r.nome, natureza: r.natureza, tipo: r.tipo, ativa: r.ativa,
  }));
}

/**
 * Liga ou desliga uma conta do plano.
 *
 * Desativar não apaga nada: a conta some do formulário de nova despesa
 * (§ escopo), mas toda despesa já lançada com ela continua na lista, porque
 * `despesa.plano_conta_id` não se mexe.
 */
export async function alternarContaAtiva(
  c: PoolClient, id: string, ativa: boolean, usuarioId: string | null,
): Promise<{ id: string; ativa: boolean }> {
  const { rows } = await c.query<{ codigo: string }>(
    "update plano_conta set ativa = $2 where id = $1 returning codigo", [id, ativa]);
  if (!rows[0]) throw new NaoEncontrado("Conta do plano não encontrada.");
  await registrarEvento(c, usuarioId, "plano_conta", id, "editou", null, { codigo: rows[0].codigo, ativa });
  return { id, ativa };
}

export interface EntradaDespesa {
  planoContaId: string;
  descricao: string;
  valor: Centavos;
  data: DataISO;
  contaSaidaId: string;
}

export interface DespesaLancada {
  id: string;
  status: StatusDespesa;
  /** Nulo quando nasce 'previsto' — ainda não saiu dinheiro nenhum. */
  movimentoId: string | null;
}

export async function lancarDespesa(
  c: PoolClient, e: EntradaDespesa, hoje: DataISO, usuarioId: string | null,
): Promise<DespesaLancada> {
  const descricao = (e.descricao ?? "").trim();
  if (!e.planoContaId || !descricao || !e.data || !e.contaSaidaId || !e.valor || e.valor <= 0) {
    throw new ErroDeValidacao(MSG.despesaIncompleta);
  }

  const { rows: contas } = await c.query<{ nome: string; ativa: boolean }>(
    "select nome, ativa from plano_conta where id = $1", [e.planoContaId]);
  if (!contas[0]) throw new NaoEncontrado("Conta do plano não encontrada.");

  const status = statusDaData(e.data, hoje);

  const { rows } = await c.query<{ id: string }>(
    `insert into despesa (plano_conta_id, descricao, valor, data_pagamento, conta_saida_id, status)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [e.planoContaId, descricao, paraNumeric(e.valor), e.data, e.contaSaidaId, status]);
  const id = rows[0]!.id;

  // Só sai do caixa quando já aconteceu. Previsto fica só na lista, sem
  // movimento — é o mesmo desenho do custo previsto da §3.4, sem precisar de
  // um segundo lançamento quando a data chegar: quem confirma é quem paga.
  const movimentoId = status === "pago"
    ? await registrarMovimento(c, {
        contaId: e.contaSaidaId, data: e.data, descricao, tipo: "despesa", valor: -e.valor, despesaId: id,
      })
    : null;

  await registrarEvento(c, usuarioId, "despesa", id, "criou", null, {
    conta: contas[0].nome, descricao, valor: e.valor, data: e.data, status,
  });

  return { id, status, movimentoId };
}

/**
 * Exclui a despesa e devolve o valor ao saldo, quando havia saído — §4.8,
 * mesmo mecanismo de `excluirCusto`.
 */
export async function excluirDespesa(
  c: PoolClient, id: string, usuarioId: string | null,
): Promise<{ valor: Centavos; devolvidoAoCaixa: Centavos }> {
  const { rows } = await c.query<{ descricao: string; valor: string }>(
    "select descricao, valor from despesa where id = $1 for update", [id]);
  const despesa = rows[0];
  if (!despesa) throw new NaoEncontrado("Despesa não encontrada.");

  const { rows: movimentos } = await c.query<{ soma: string }>(
    "select coalesce(sum(valor), 0) soma from movimento_caixa where despesa_id = $1", [id]);

  await c.query("delete from despesa where id = $1", [id]);

  await registrarEvento(c, usuarioId, "despesa", id, "excluiu",
    { descricao: despesa.descricao, valor: despesa.valor }, null);

  return {
    valor: deNumeric(despesa.valor)!,
    devolvidoAoCaixa: -deNumeric(movimentos[0]!.soma)!,
  };
}

export interface FiltroDespesas {
  /** "AAAA-MM". Nulo = todos os meses. */
  mes?: string | null;
  grupoCodigo?: number | null;
  status?: StatusDespesa | null;
}

export interface Despesa {
  id: string;
  descricao: string;
  valor: Centavos;
  dataPagamento: DataISO;
  status: StatusDespesa;
  contaSaida: { id: string; nome: string };
  planoConta: {
    id: string; codigo: string; nome: string;
    grupoCodigo: number; grupoNome: string;
    natureza: "fixa" | "variavel"; tipo: "operacional" | "retirada" | "nao_operacional";
  };
}

/** A lista da tela, mais recente primeiro — o que a loja acabou de lançar é o que quer conferir. */
export async function listarDespesas(c: PoolClient, f: FiltroDespesas = {}): Promise<Despesa[]> {
  const condicoes: string[] = [];
  const params: unknown[] = [];

  if (f.mes) {
    params.push(`${f.mes}-01`);
    const p = params.length;
    condicoes.push(`d.data_pagamento >= $${p}::date and d.data_pagamento < ($${p}::date + interval '1 month')`);
  }
  if (f.grupoCodigo != null) {
    params.push(f.grupoCodigo);
    condicoes.push(`pc.grupo_codigo = $${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    condicoes.push(`d.status = $${params.length}`);
  }

  const onde = condicoes.length ? `where ${condicoes.join(" and ")}` : "";

  const { rows } = await c.query<{
    id: string; descricao: string; valor: string; data_pagamento: DataISO; status: StatusDespesa;
    conta_id: string; conta_nome: string;
    plano_id: string; plano_codigo: string; plano_nome: string;
    grupo_codigo: number; grupo_nome: string;
    natureza: "fixa" | "variavel"; tipo: "operacional" | "retirada" | "nao_operacional";
  }>(
    `select d.id, d.descricao, d.valor, d.data_pagamento, d.status,
            ct.id as conta_id, ct.nome as conta_nome,
            pc.id as plano_id, pc.codigo as plano_codigo, pc.nome as plano_nome,
            pc.grupo_codigo, pc.grupo_nome, pc.natureza, pc.tipo
       from despesa d
       join conta ct on ct.id = d.conta_saida_id
       join plano_conta pc on pc.id = d.plano_conta_id
       ${onde}
      order by d.data_pagamento desc, d.criado_em desc`,
    params);

  return rows.map((r) => ({
    id: r.id, descricao: r.descricao, valor: deNumeric(r.valor)!,
    dataPagamento: r.data_pagamento, status: r.status,
    contaSaida: { id: r.conta_id, nome: r.conta_nome },
    planoConta: {
      id: r.plano_id, codigo: r.plano_codigo, nome: r.plano_nome,
      grupoCodigo: r.grupo_codigo, grupoNome: r.grupo_nome, natureza: r.natureza, tipo: r.tipo,
    },
  }));
}
