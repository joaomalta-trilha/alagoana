/**
 * A comissão provisionada na entrada — pedido da loja em 22/08/2026.
 *
 * A §3.4 já descrevia custo previsto e a §4.6 já dizia que o checkbox da venda
 * "vem desmarcado quando o veículo já possui algum custo de categoria Comissão,
 * porque já foram provisionadas na entrada". Faltava alguém provisionar.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { criarVeiculo, venderVeiculo } from "../../src/servicos/veiculos.js";
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

  it("na venda, o checkbox vem desmarcado — a §4.6 sempre previu isto", async () => {
    const v = await carro();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: b.alagoana,
    }, b.usuarioId));

    // Nada de comissão nova: a que existe é a provisionada na entrada.
    expect(r.comissoesLancadas).toEqual([]);
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(1);
  });

  it("quem insiste em lançar na venda leva as duas, e é escolha explícita", async () => {
    const v = await carro();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-20", valorVenda: 4_000_000, contaId: null,
      lancarComissoes: true,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(2);
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
