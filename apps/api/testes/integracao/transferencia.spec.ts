/**
 * Transferência entre contas — remanejamento pedido pela loja em 17/08/2026.
 *
 * O que estes casos protegem: o dinheiro não some nem se multiplica, a
 * transferência não vira aporte, e o par de linhas é um fato no banco.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import {
  transferir, previaExclusaoTransferencia, excluirTransferencia,
} from "../../src/servicos/caixa.js";
import { criarVeiculo } from "../../src/servicos/veiculos.js";
import { visaoCaixa } from "../../src/servicos/consultas.js";
import { MSG } from "../../src/dominio/mensagens.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

let b: Base;

beforeEach(async () => {
  await limpar();
  b = await base(5_000_000, 1_000_000);
});

afterAll(async () => { await pool.end(); });

describe("transferência entre contas", () => {
  it("tira de uma e põe na outra, sem mexer no total", async () => {
    const antes = (await saldo(b.alagoana)) + (await saldo(b.joao));

    await comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor: 750_000,
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(5_000_000 - 750_000);
    expect(await saldo(b.joao)).toBe(1_000_000 + 750_000);
    expect((await saldo(b.alagoana)) + (await saldo(b.joao))).toBe(antes);
  });

  it("grava duas linhas que se conhecem, de sinais opostos", async () => {
    await comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor: 750_000,
    }, b.usuarioId));

    const { rows } = await pool.query<{ valor: string; transferencia_id: string }>(
      "select valor, transferencia_id from movimento_caixa where tipo = 'transferencia'");

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.transferencia_id)).size).toBe(1);
    expect(rows.map((r) => Number(r.valor)).sort((x, y) => x - y)).toEqual([-7500, 7500]);
  });

  it("cada extrato conta a sua metade, com o nome da outra conta", async () => {
    await comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor: 750_000,
    }, b.usuarioId));

    const { extrato } = await comLeitura((c) => visaoCaixa(c));
    const descricoes = extrato.map((m) => `${m.conta}: ${m.descricao}`).sort();
    expect(descricoes).toEqual([
      "Alagoana: Transferência para João",
      "João: Transferência de Alagoana",
    ]);
  });

  it("a observação entra na descrição das duas linhas", async () => {
    await comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor: 100_000,
      observacao: "Reembolso da viagem",
    }, b.usuarioId));

    const { extrato } = await comLeitura((c) => visaoCaixa(c));
    expect(extrato.every((m) => m.descricao.endsWith(" · Reembolso da viagem"))).toBe(true);
  });

  it("não é aporte: o capital do sócio não se mexe", async () => {
    await comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor: 750_000,
    }, b.usuarioId));

    const { capitalPorSocio } = await comLeitura((c) => visaoCaixa(c));
    const joao = capitalPorSocio.find((s) => s.nome === "João");
    expect(joao?.capital ?? 0).toBe(0);

    const { rows } = await pool.query<{ n: string }>("select count(*) n from aporte_socio");
    expect(rows[0]!.n).toBe("0");
  });

  it("recusa mandar para a mesma conta", async () => {
    await expect(comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.alagoana, data: "2026-08-17", valor: 100_000,
    }, b.usuarioId))).rejects.toThrow(MSG.transferenciaMesmaConta);
  });

  it("recusa valor zero ou negativo", async () => {
    await expect(comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor: 0,
    }, b.usuarioId))).rejects.toThrow(MSG.transferenciaSemValor);
  });

  it("recusa o que a origem não tem, e não grava metade", async () => {
    await expect(comTransacao((c) => transferir(c, {
      origemId: b.joao, destinoId: b.alagoana, data: "2026-08-17", valor: 9_000_000,
    }, b.usuarioId))).rejects.toThrow(/Saldo insuficiente em João/);

    // A transação inteira caiu: nem a perna de saída ficou.
    const { rows } = await pool.query<{ n: string }>(
      "select count(*) n from movimento_caixa where tipo = 'transferencia'");
    expect(rows[0]!.n).toBe("0");
    expect(await saldo(b.joao)).toBe(1_000_000);
  });
});

describe("apagar uma transferência", () => {
  async function transferida(valor = 750_000) {
    const r = await comTransacao((c) => transferir(c, {
      origemId: b.alagoana, destinoId: b.joao, data: "2026-08-17", valor,
    }, b.usuarioId));
    return r.id;
  }

  it("devolve os saldos ao que eram, e o total não se mexe", async () => {
    const id = await transferida();
    await comTransacao((c) => excluirTransferencia(c, id, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(5_000_000);
    expect(await saldo(b.joao)).toBe(1_000_000);
  });

  it("apaga as duas pernas, nunca uma só", async () => {
    const id = await transferida();
    await comTransacao((c) => excluirTransferencia(c, id, b.usuarioId));

    const { rows } = await pool.query<{ n: string }>(
      "select count(*) n from movimento_caixa");
    expect(rows[0]!.n).toBe("0");
  });

  it("some do extrato inteiro", async () => {
    const id = await transferida();
    await comTransacao((c) => excluirTransferencia(c, id, b.usuarioId));

    const { extrato } = await comLeitura((c) => visaoCaixa(c));
    expect(extrato).toEqual([]);
  });

  it("a prévia mostra em que saldo cada conta fica", async () => {
    const id = await transferida();
    const previa = await comLeitura((c) => previaExclusaoTransferencia(c, id));

    expect(previa.valor).toBe(750_000);
    expect(previa.origem).toEqual({
      nome: "Alagoana", saldoAtual: 4_250_000, fica: 5_000_000,
    });
    expect(previa.destino).toEqual({
      nome: "João", saldoAtual: 1_750_000, fica: 1_000_000,
    });
    expect(previa.impedimento).toBeNull();

    // Prévia não escreve.
    expect(await saldo(b.joao)).toBe(1_750_000);
  });

  it("recusa quando o destino já gastou o dinheiro", async () => {
    const id = await transferida();
    // O João compra um carro com o que recebeu.
    await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-08-17", valorCompra: 1_500_000, contaId: b.joao, provisionarComissao: false,
    }, b.usuarioId));

    expect(await saldo(b.joao)).toBe(250_000);
    await expect(comTransacao((c) => excluirTransferencia(c, id, b.usuarioId)))
      .rejects.toThrow(/tira R\$ 7\.500,00 de João, que tem R\$ 2\.500,00/);

    // Recusou e não mexeu em nada.
    expect(await saldo(b.joao)).toBe(250_000);
    const { rows } = await pool.query<{ n: string }>(
      "select count(*) n from movimento_caixa where transferencia_id = $1", [id]);
    expect(rows[0]!.n).toBe("2");
  });

  it("recusa id que não é de transferência", async () => {
    await expect(comLeitura((c) =>
      previaExclusaoTransferencia(c, "00000000-0000-0000-0000-000000000000")))
      .rejects.toThrow(MSG.transferenciaNaoEncontrada);
  });

  it("deixa o rastro do que foi apagado na auditoria", async () => {
    const id = await transferida();
    await comTransacao((c) => excluirTransferencia(c, id, b.usuarioId));

    const { rows } = await pool.query<{ acao: string; antes: unknown }>(
      "select acao, antes from evento where entidade_id = $1 order by criado_em", [id]);
    expect(rows.map((r) => r.acao)).toEqual(["transferiu", "excluiu"]);
    expect(rows[1]!.antes).toEqual({
      origem: "Alagoana", destino: "João", valor: 750_000, data: "2026-08-17",
    });
  });

  it("uma transferência não interfere na outra", async () => {
    const a = await transferida(100_000);
    const c2 = await transferida(200_000);
    await comTransacao((c) => excluirTransferencia(c, a, b.usuarioId));

    expect(await saldo(b.joao)).toBe(1_000_000 + 200_000);
    const { rows } = await pool.query<{ n: string }>(
      "select count(*) n from movimento_caixa where transferencia_id = $1", [c2]);
    expect(rows[0]!.n).toBe("2");
  });
});
