/**
 * Desfazer a venda — pedido pela loja em 17/08/2026.
 *
 * A regra é simétrica: desfazer apaga o que a venda criou, e só isso. Custo
 * anterior à venda fica, porque o carro volta ao pátio com a preparação que
 * já tinha. E há dois casos em que desfazer é recusado, ambos porque o
 * estrago não seria reversível sozinho.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import {
  criarVeiculo, venderVeiculo, previaDesfazerVenda, desfazerVenda,
} from "../../src/servicos/veiculos.js";
import { lancarCusto } from "../../src/servicos/custos.js";
import { ficha } from "../../src/servicos/consultas.js";
import { MSG } from "../../src/dominio/mensagens.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-08-17";
let b: Base;

async function carroVendido(comCusto = 0) {
  const v = await comTransacao((c) => criarVeiculo(c, {
    marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
    dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana, provisionarComissao: false,
  }, b.usuarioId));

  if (comCusto) {
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Pintura", categoria: "Pintura",
      data: "2026-06-10", valor: comCusto, modoRateio: "mesmo",
      previsto: false, contaId: b.alagoana,
    }, b.usuarioId));
  }

  await comTransacao((c) => venderVeiculo(c, v.id, {
    dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
  }, b.usuarioId));

  return v;
}

beforeEach(async () => {
  await limpar();
  b = await base(10_000_000, 0);
});

afterAll(async () => { await pool.end(); });

describe("desfazer venda", () => {
  it("devolve o carro ao pátio e limpa data e valor da venda", async () => {
    const v = await carroVendido();
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.vendido).toBe(false);
    expect(f.dataVenda).toBeNull();
    expect(f.valorVenda).toBeNull();
    expect(f.lucro).toBeNull();
    expect(f.garantia).toBeNull();
  });

  it("devolve o caixa ao que era antes da venda, comissão inclusive", async () => {
    const antes = await saldo(b.alagoana);          // já descontada a compra
    const v = await carroVendido();
    // Entraram 40.000 e saíram 1.500 de comissão na mesma hora.
    expect(await saldo(b.alagoana)).toBe(antes + 4_000_000 - 150_000 - 3_000_000);

    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));
    expect(await saldo(b.alagoana)).toBe(antes - 3_000_000);
  });

  it("devolve a comissão à provisão em vez de apagá-la", async () => {
    const v = await carroVendido();
    const vendido = await comLeitura((c) => ficha(c, v.id, HOJE));
    const paga = vendido.custos.filter((k) => k.categoria === "Comissão");
    expect(paga).toHaveLength(1);
    expect(paga[0]!.prevista).toBe(false);

    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const depois = f.custos.filter((k) => k.categoria === "Comissão");
    expect(depois).toHaveLength(1);
    expect(depois[0]!.prevista).toBe(true);
  });

  it("preserva o custo anterior à venda: o carro volta preparado", async () => {
    const v = await carroVendido(60_000);
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    // A comissão fica, agora como provisão; a pintura, que é anterior à
    // venda, nunca esteve em jogo.
    expect(f.custos.map((k) => k.descricao).sort()).toEqual(["Comissão Alagoana", "Pintura"]);
    expect(f.custos.find((k) => k.descricao === "Pintura")!.prevista).toBe(false);
    expect(f.custoPreparacao).toBe(60_000 + 150_000);
    expect(f.custoTotal).toBe(3_060_000 + 150_000);
  });

  it("a prévia mostra a conta antes de qualquer estrago", async () => {
    const v = await carroVendido();
    const previa = await comLeitura((c) => previaDesfazerVenda(c, v.id));

    expect(previa.venda).toEqual({ data: "2026-08-10", valor: 4_000_000 });
    // O que sai é o líquido: 40.000 da venda menos os 1.500 da comissão, que
    // some junto e devolve o dinheiro.
    expect(previa.caixa).toEqual([
      { conta: "Alagoana", valor: 3_850_000, saldoAtual: 10_850_000, cabe: true },
    ]);
    expect(previa.comissoes).toEqual({ quantidade: 1, soma: 150_000 });
    expect(previa.impedimento).toBeNull();

    // Prévia não escreve: o carro continua vendido.
    expect((await comLeitura((c) => ficha(c, v.id, HOJE))).vendido).toBe(true);
  });

  it("recusa quando entrou um carro na troca", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana, provisionarComissao: false,
    }, b.usuarioId));

    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
      trocas: [{
        marca: "Ford", modelo: "Ka", cor: "Preto", placa: "BBB2B22",
        avaliacao: 1_000_000, mercado: 1_000_000, modo: "avaliacao", provisionarComissao: false,
      }],
    }, b.usuarioId));

    await expect(comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId)))
      .rejects.toThrow(/entrou o V-02 · Ford Ka na troca/);

    // Recusou e não mexeu em nada.
    expect((await comLeitura((c) => ficha(c, v.id, HOJE))).vendido).toBe(true);
  });

  it("recusa quando o dinheiro da venda já foi gasto", async () => {
    b = await limpar().then(() => base(0, 0));
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    // Gasta o dinheiro em outro carro.
    await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "BBB2B22",
      dataCompra: "2026-08-11", valorCompra: 3_500_000, contaId: b.alagoana, provisionarComissao: false,
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(350_000);
    await expect(comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId)))
      .rejects.toThrow(/Desfazer a venda tira R\$ 38\.500,00 de Alagoana/);
  });

  it("recusa desfazer o que não está vendido", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana, provisionarComissao: false,
    }, b.usuarioId));

    await expect(comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId)))
      .rejects.toThrow(MSG.vendaJaDesfeita);
  });

  it("vender de novo depois de desfazer funciona, e não duplica comissão", async () => {
    const v = await carroVendido();
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-15", valorVenda: 4_200_000, contaId: b.alagoana,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.vendido).toBe(true);
    expect(f.valorVenda).toBe(4_200_000);
    expect(f.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(1);
  });

  it("deixa o rastro na auditoria", async () => {
    const v = await carroVendido();
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    const { rows } = await pool.query<{ acao: string; antes: unknown }>(
      "select acao, antes from evento where entidade_id = $1 order by criado_em", [v.id]);
    expect(rows.map((r) => r.acao)).toEqual(["criou", "vendeu", "desfez a venda"]);
    expect(rows[2]!.antes).toEqual({ data: "2026-08-10", valor: 4_000_000 });
  });
});

describe("comissão sai do caixa na hora da venda", () => {
  it("a venda de 40.000 com 1.500 de comissão deixa 38.500 na conta", async () => {
    const antes = await saldo(b.alagoana);
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));

    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
      lancarComissoes: true,
    }, b.usuarioId));

    expect(r.entradaEmCaixa).toBe(4_000_000);
    expect(r.liquidoEmCaixa).toBe(3_850_000);
    expect(await saldo(b.alagoana)).toBe(antes + 3_850_000);
  });

  it("o extrato conta as duas coisas: a venda cheia e a comissão", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
      lancarComissoes: true,
    }, b.usuarioId));

    const { rows } = await pool.query<{ descricao: string; valor: string; tipo: string }>(
      "select descricao, valor, tipo from movimento_caixa order by valor desc");
    expect(rows.map((m) => [m.tipo, m.descricao, Number(m.valor)])).toEqual([
      ["venda", "Venda · Ford Ka", 40000],
      ["custo", "Comissão Alagoana · Ford Ka", -1500],
    ]);
  });

  it("sem conta na venda, a comissão fica provisionada e o caixa não muda", async () => {
    const antes = await saldo(b.alagoana);
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));

    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: null,
      lancarComissoes: true,
    }, b.usuarioId));

    expect(r.liquidoEmCaixa).toBe(4_000_000);   // nada saiu porque nada entrou
    expect(await saldo(b.alagoana)).toBe(antes);

    // O custo existe, esperando ser pago pela tela de custo (§3.4).
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const comissao = f.custos.find((k) => k.categoria === "Comissão")!;
    expect(comissao.valor).toBe(150_000);
    expect(comissao.devolveAoCaixa).toBe(0);
  });

  it("apagar a comissão à mão devolve o dinheiro", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
      lancarComissoes: true,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const comissao = f.custos.find((k) => k.categoria === "Comissão")!;
    expect(comissao.devolveAoCaixa).toBe(150_000);
  });
});
