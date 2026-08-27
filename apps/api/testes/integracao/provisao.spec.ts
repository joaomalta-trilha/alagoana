/**
 * A comissão provisionada na entrada — pedido da loja em 22/08/2026.
 *
 * A §3.4 já descrevia custo previsto e a §4.6 já dizia que o checkbox da venda
 * "vem desmarcado quando o veículo já possui algum custo de categoria Comissão,
 * porque já foram provisionadas na entrada". Faltava alguém provisionar.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import {
  criarVeiculo, venderVeiculo, desfazerVenda,
} from "../../src/servicos/veiculos.js";
import { lancarCusto } from "../../src/servicos/custos.js";
import { ficha } from "../../src/servicos/consultas.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-08-22";
let b: Base;

async function carro(contaId: string | null = null) {
  return comTransacao((c) => criarVeiculo(c, {
    marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
    dataCompra: "2026-08-01", valorCompra: 3_000_000,
    valorAnuncio: 4_000_000, contaId,
  }, b.usuarioId));
}

beforeEach(async () => {
  await limpar();
  b = await base(10_000_000, 0);
});

afterAll(async () => { await pool.end(); });

describe("comissão provisionada quando o carro entra", () => {
  it("nasce com a comissão prevista, sem data", async () => {
    const v = await carro();
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));

    const comissoes = f.custos.filter((k) => k.categoria === "Comissão");
    expect(comissoes).toHaveLength(1);
    expect(comissoes[0]!.descricao).toBe("Comissão Alagoana");
    expect(comissoes[0]!.valor).toBe(150_000);
    expect(comissoes[0]!.prevista).toBe(true);
    expect(comissoes[0]!.data).toBeNull();
  });

  it("entra no custo total desde o primeiro dia", async () => {
    const v = await carro();
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));

    expect(f.custoPreparacao).toBe(150_000);
    expect(f.custoTotal).toBe(3_150_000);
    // É o ponto: o lucro projetado passa a contar os 1.500 que sempre iam sair.
    expect(f.lucroProjetado).toBe(4_000_000 - 3_150_000);
  });

  it("não tira dinheiro do caixa — previsto ainda não aconteceu", async () => {
    const antes = await saldo(b.alagoana);
    await carro(b.alagoana);
    // Saiu só a compra do carro, nada de comissão.
    expect(await saldo(b.alagoana)).toBe(antes - 3_000_000);
  });

  it("o carro recebido na troca também nasce provisionado", async () => {
    const v = await carro();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: null,
      trocas: [{
        marca: "Ford", modelo: "Ka", cor: "Preto", placa: "BBB2B22",
        avaliacao: 1_000_000, modo: "avaliacao",
      }],
    }, b.usuarioId));

    const entrou = await comLeitura((c) => ficha(c, r.veiculosQueEntraram[0]!.id, HOJE));
    const comissao = entrou.custos.find((k) => k.categoria === "Comissão")!;
    expect(comissao.prevista).toBe(true);
    expect(comissao.valor).toBe(150_000);
  });

  it("a venda PAGA a provisão em vez de criar outra", async () => {
    const v = await carro();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    expect(r.comissoesLancadas).toEqual([{ beneficiario: "Comissão Alagoana", valor: 150_000 }]);

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const comissoes = f.custos.filter((k) => k.categoria === "Comissão");
    expect(comissoes).toHaveLength(1);          // continua sendo UMA
    expect(comissoes[0]!.prevista).toBe(false); // agora paga
    expect(comissoes[0]!.data).toBe("2026-08-20");
  });

  it("o dinheiro sai da conta que recebeu a venda", async () => {
    const antes = await saldo(b.alagoana);
    const v = await carro();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    // 40.000 entram, 1.500 da comissão saem: 38.500 líquidos.
    expect(await saldo(b.alagoana)).toBe(antes + 3_850_000);
  });

  it("o custo total não muda ao pagar: a provisão já estava lá", async () => {
    const v = await carro();
    const antes = (await comLeitura((c) => ficha(c, v.id, HOJE))).custoTotal;
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custoTotal).toBe(antes);
    expect(f.lucro).toBe(4_000_000 - antes);
  });

  it("carro que já tem comissão paga não é cobrado de novo", async () => {
    const v = await carro();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    // Paga à mão, fora da venda.
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Comissão Alagoana", categoria: "Comissão",
      data: "2026-08-21", valor: 150_000, modoRateio: "mesmo",
      previsto: false, contaId: null,
    }, b.usuarioId));

    const antes = await saldo(b.alagoana);
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-22", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    expect(r.comissoesLancadas).toEqual([]);        // veio desmarcado
    expect(await saldo(b.alagoana)).toBe(antes + 4_000_000);
  });

  it("sem provisão nenhuma, a venda ainda sabe criar a comissão do zero", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "Ka", cor: "Preto", placa: "SEM1P00",
      dataCompra: "2026-08-01", valorCompra: 3_000_000, contaId: null,
      provisionarComissao: false,
    }, b.usuarioId));

    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    expect(r.comissoesLancadas).toHaveLength(1);
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const comissao = f.custos.find((k) => k.categoria === "Comissão")!;
    expect(comissao.prevista).toBe(false);
    expect(f.custoTotal).toBe(3_150_000);
  });
});

describe("desfazer a venda devolve a comissão à provisão", () => {
  it("a comissão não some — volta a ser prevista", async () => {
    const v = await carro();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const comissoes = f.custos.filter((k) => k.categoria === "Comissão");
    expect(comissoes).toHaveLength(1);
    expect(comissoes[0]!.prevista).toBe(true);
    expect(comissoes[0]!.data).toBeNull();
    // O carro volta ao pátio com o custo que tinha antes de vender.
    expect(f.custoTotal).toBe(3_150_000);
  });

  it("o dinheiro da comissão volta para a conta", async () => {
    const antes = await saldo(b.alagoana);
    const v = await carro(b.alagoana);
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));
    await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));

    // Sobra só a compra do carro: a venda e a comissão foram desfeitas.
    expect(await saldo(b.alagoana)).toBe(antes - 3_000_000);
  });

  it("vender de novo paga a provisão outra vez, e uma vez só", async () => {
    const v = await carro();
    for (const data of ["2026-08-20", "2026-08-22"]) {
      await comTransacao((c) => venderVeiculo(c, v.id, {
        dataVenda: data, valorVenda: 4_000_000, contaId: b.alagoana,
      }, b.usuarioId));
      if (data === "2026-08-20") {
        await comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId));
      }
    }

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(1);
    expect(f.custoTotal).toBe(3_150_000);
  });
});

describe("custo previsto lançado à mão (§3.4)", () => {
  it("aceita sem data quando é previsto", async () => {
    const v = await carro();
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Revisão agendada", categoria: "Revisão",
      data: null, valor: 80_000, modoRateio: "mesmo", previsto: true, contaId: null,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    const revisao = f.custos.find((k) => k.descricao === "Revisão agendada")!;
    expect(revisao.prevista).toBe(true);
    expect(revisao.data).toBeNull();
    expect(f.custoTotal).toBe(3_000_000 + 150_000 + 80_000);
  });

  it("recusa sem data quando não é previsto", async () => {
    const v = await carro();
    await expect(comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Pintura", categoria: "Pintura",
      data: null, valor: 80_000, modoRateio: "mesmo", previsto: false, contaId: null,
    }, b.usuarioId))).rejects.toThrow(/data/);
  });

  it("previsto não mexe no caixa, mesmo com conta escolhida", async () => {
    const v = await carro();
    const antes = await saldo(b.alagoana);
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "IPVA do ano que vem", categoria: "Imposto",
      data: null, valor: 120_000, modoRateio: "mesmo", previsto: true,
      contaId: b.alagoana,
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(antes);
  });
});
