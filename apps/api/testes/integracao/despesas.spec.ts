/**
 * Despesa da empresa — pedido pela loja em 16/09/2026.
 *
 * Existe mesmo com o pátio vazio, ao contrário do custo de veículo. Reaproveita
 * o `registrarMovimento` que já existe: mesma validação de saldo, mesmo jeito
 * de gravar. O que é novo é só de onde vem o dinheiro — de uma conta do plano,
 * não de um veículo — e que o status nasce da data, sem campo na tela.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import {
  alternarContaAtiva, excluirDespesa, lancarDespesa, listarDespesas, listarPlanoContas,
} from "../../src/servicos/despesas.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-09-16";
let b: Base;

async function contaDoPlano(codigo: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "select id from plano_conta where codigo = $1", [codigo]);
  return rows[0]!.id;
}

beforeEach(async () => {
  await limpar();
  b = await base(10_000_000, 0);
});

afterAll(async () => { await pool.end(); });

describe("o plano de contas vem semeado pela migração", () => {
  it("tem 42 contas, com o grupo 3 (Pessoal) inteiro desligado", async () => {
    const plano = await comLeitura((c) => listarPlanoContas(c));
    expect(plano).toHaveLength(42);

    const pessoal = plano.filter((p) => p.grupoCodigo === 3);
    expect(pessoal).toHaveLength(6);
    expect(pessoal.every((p) => !p.ativa)).toBe(true);

    const aluguel = plano.find((p) => p.codigo === "2.1")!;
    expect(aluguel).toMatchObject({ nome: "Aluguel", natureza: "fixa", tipo: "operacional", ativa: true });
  });
});

describe("lançar despesa (decisão de 16/09/2026: status vem da data)", () => {
  it("data de hoje nasce 'pago', gera movimento e desconta o saldo", async () => {
    const aluguel = await contaDoPlano("2.1");
    const antes = await saldo(b.alagoana);

    const r = await comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel do pátio — setembro",
      valor: 450_000, data: HOJE, contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));

    expect(r.status).toBe("pago");
    expect(r.movimentoId).not.toBeNull();
    expect(await saldo(b.alagoana)).toBe(antes - 450_000);
  });

  it("data futura nasce 'previsto', sem movimento nem desconto", async () => {
    const aluguel = await contaDoPlano("2.1");
    const antes = await saldo(b.alagoana);

    const r = await comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel do pátio — outubro",
      valor: 450_000, data: "2026-10-01", contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));

    expect(r.status).toBe("previsto");
    expect(r.movimentoId).toBeNull();
    expect(await saldo(b.alagoana)).toBe(antes);
  });

  it("recusa despesa incompleta com a mensagem própria", async () => {
    const aluguel = await contaDoPlano("2.1");
    await expect(comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "", valor: 450_000, data: HOJE, contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId))).rejects.toThrow("Preencha conta, descrição, data e um valor maior que zero.");
  });

  it("recusa quando o saldo não cobre, com a mesma mensagem de qualquer outro movimento", async () => {
    const aluguel = await contaDoPlano("2.1");
    await expect(comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel", valor: 99_000_000, data: HOJE, contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId))).rejects.toThrow(/Saldo insuficiente em Alagoana/);
  });
});

describe("plano de contas: desativar não apaga histórico", () => {
  it("conta desativada some do que seria o formulário, mas a despesa lançada com ela continua na lista", async () => {
    const portais = await contaDoPlano("1.2");
    await comTransacao((c) => lancarDespesa(c, {
      planoContaId: portais, descricao: "OLX Pro", valor: 119_000, data: HOJE, contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));

    await comTransacao((c) => alternarContaAtiva(c, portais, false, b.usuarioId));

    const plano = await comLeitura((c) => listarPlanoContas(c));
    expect(plano.find((p) => p.codigo === "1.2")!.ativa).toBe(false);

    const despesas = await comLeitura((c) => listarDespesas(c));
    expect(despesas.some((d) => d.descricao === "OLX Pro")).toBe(true);
  });
});

describe("listar despesas com filtro", () => {
  it("filtra por mês, grupo e status ao mesmo tempo", async () => {
    const aluguel = await contaDoPlano("2.1");
    const trafego = await contaDoPlano("1.1");

    await comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel de setembro", valor: 450_000,
      data: "2026-09-05", contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));
    await comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel de outubro", valor: 450_000,
      data: "2026-10-01", contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));
    await comTransacao((c) => lancarDespesa(c, {
      planoContaId: trafego, descricao: "Meta Ads", valor: 280_000,
      data: "2026-09-03", contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));

    const deSetembro = await comLeitura((c) => listarDespesas(c, { mes: "2026-09" }));
    expect(deSetembro.map((d) => d.descricao).sort())
      .toEqual(["Aluguel de setembro", "Meta Ads"]);

    const grupoOcupacao = await comLeitura((c) => listarDespesas(c, { grupoCodigo: 2 }));
    expect(grupoOcupacao.map((d) => d.descricao)).toEqual(["Aluguel de outubro", "Aluguel de setembro"]);

    const previstas = await comLeitura((c) => listarDespesas(c, { status: "previsto" }));
    expect(previstas.map((d) => d.descricao)).toEqual(["Aluguel de outubro"]);
  });
});

describe("excluir despesa", () => {
  it("devolve o valor ao saldo quando a despesa já tinha saído", async () => {
    const aluguel = await contaDoPlano("2.1");
    const antes = await saldo(b.alagoana);

    const r = await comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel", valor: 450_000, data: HOJE, contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));

    const previa = await comTransacao((c) => excluirDespesa(c, r.id, b.usuarioId));
    expect(previa.devolvidoAoCaixa).toBe(450_000);
    expect(await saldo(b.alagoana)).toBe(antes);

    const restantes = await comLeitura((c) => listarDespesas(c));
    expect(restantes).toHaveLength(0);
  });

  it("previsto excluído não mexe no saldo — nunca tinha saído nada", async () => {
    const aluguel = await contaDoPlano("2.1");
    const antes = await saldo(b.alagoana);

    const r = await comTransacao((c) => lancarDespesa(c, {
      planoContaId: aluguel, descricao: "Aluguel de outubro", valor: 450_000,
      data: "2026-10-01", contaSaidaId: b.alagoana,
    }, HOJE, b.usuarioId));

    const previa = await comTransacao((c) => excluirDespesa(c, r.id, b.usuarioId));
    // `-deNumeric('0.00')` é -0 em JS: mesmo valor de 0 para todo efeito
    // financeiro, mas `toBe` usa `Object.is`, que os distingue. `===` não.
    expect(previa.devolvidoAoCaixa === 0).toBe(true);
    expect(await saldo(b.alagoana)).toBe(antes);
  });
});
