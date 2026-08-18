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
    dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana,
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

  it("tira do caixa exatamente o que a venda pôs", async () => {
    const antes = await saldo(b.alagoana);          // já descontada a compra
    const v = await carroVendido();
    expect(await saldo(b.alagoana)).toBe(antes + 4_000_000 - 3_000_000);

    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));
    expect(await saldo(b.alagoana)).toBe(antes - 3_000_000);
  });

  it("apaga as comissões que a venda lançou", async () => {
    const v = await carroVendido();
    const vendido = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(vendido.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(1);

    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(0);
  });

  it("preserva o custo anterior à venda: o carro volta preparado", async () => {
    const v = await carroVendido(60_000);
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custos.map((k) => k.descricao)).toEqual(["Pintura"]);
    expect(f.custoPreparacao).toBe(60_000);
    expect(f.custoTotal).toBe(3_060_000);
  });

  it("a prévia mostra a conta antes de qualquer estrago", async () => {
    const v = await carroVendido();
    const previa = await comLeitura((c) => previaDesfazerVenda(c, v.id));

    expect(previa.venda).toEqual({ data: "2026-08-10", valor: 4_000_000 });
    expect(previa.caixa).toEqual([
      { conta: "Alagoana", valor: 4_000_000, saldoAtual: 11_000_000, cabe: true },
    ]);
    expect(previa.comissoes).toEqual({ quantidade: 1, soma: 150_000 });
    expect(previa.impedimento).toBeNull();

    // Prévia não escreve: o carro continua vendido.
    expect((await comLeitura((c) => ficha(c, v.id, HOJE))).vendido).toBe(true);
  });

  it("recusa quando entrou um carro na troca", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
      troca: {
        marca: "Ford", modelo: "Ka", cor: "Preto", placa: "BBB2B22",
        avaliacao: 1_000_000, mercado: 1_000_000, modo: "avaliacao",
      },
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
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null,
    }, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    // Gasta o dinheiro em outro carro.
    await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "BBB2B22",
      dataCompra: "2026-08-11", valorCompra: 3_500_000, contaId: b.alagoana,
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(500_000);
    await expect(comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId)))
      .rejects.toThrow(/Desfazer a venda tira R\$ 40\.000,00 de Alagoana/);
  });

  it("recusa desfazer o que não está vendido", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana,
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
