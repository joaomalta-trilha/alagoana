/**
 * Repasse — pedido pela loja em 14/09/2026.
 *
 * Um carro recebido só para viabilizar outra venda, repassado pelo mesmo
 * valor em seguida. Mecanicamente é igual à troca — mesma coluna, mesmo
 * cálculo de caixa —, mas com três diferenças: não paga comissão, some das
 * somas de vendas e do painel quando ele mesmo é vendido, e continua contando
 * como estoque normal enquanto está parado no pátio.
 *
 * O exemplo é o da loja: Tracker vendida por 80.000, recebendo um Ka de
 * 10.000 como repasse — não como troca.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { criarVeiculo, venderVeiculo, desfazerVenda } from "../../src/servicos/veiculos.js";
import { ficha, painel, consolidadoVendas } from "../../src/servicos/consultas.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-09-14";
let b: Base;

const KA_REPASSE = {
  marca: "Ford", modelo: "Ka", cor: "Branco", placa: "KAR3P11",
  avaliacao: 1_000_000, modo: "avaliacao" as const, origem: "repasse" as const,
};

async function tracker() {
  return comTransacao((c) => criarVeiculo(c, {
    marca: "Chevrolet", modelo: "Tracker", cor: "Branco", placa: "TRK1A11",
    dataCompra: "2026-06-01", valorCompra: 6_700_000, contaId: null, provisionarComissao: false,
  }, b.usuarioId));
}

beforeEach(async () => {
  await limpar();
  b = await base(10_000_000, 0);
});

afterAll(async () => { await pool.end(); });

describe("recebendo um repasse na venda", () => {
  it("o carro que entra nasce com origem repasse, não troca", async () => {
    const v = await tracker();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: null,
      lancarComissoes: false, trocas: [KA_REPASSE],
    }, b.usuarioId));

    const ka = await comLeitura((c) => ficha(c, r.veiculosQueEntraram[0]!.id, HOJE));
    expect(ka.origem).toBe("repasse");
    expect(ka.troca.saiu?.codigo).toBe("V-01");
  });

  it("o caixa recebe a venda menos o valor do repasse, como na troca", async () => {
    const antes = await saldo(b.alagoana);
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: b.alagoana,
      lancarComissoes: false, trocas: [KA_REPASSE],
    }, b.usuarioId));

    // 8.000.000 − 1.000.000 = 7.000.000, exatamente a fórmula da §4.5.
    expect(await saldo(b.alagoana)).toBe(antes + 7_000_000);
  });

  it("não provisiona comissão, mesmo se pedirem", async () => {
    const v = await tracker();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: null, lancarComissoes: false,
      // provisionarComissao: true de propósito — o servidor recusa mesmo assim,
      // porque não há margem real num carro repassado pelo mesmo valor.
      trocas: [{ ...KA_REPASSE, provisionarComissao: true }],
    }, b.usuarioId));

    const ka = await comLeitura((c) => ficha(c, r.veiculosQueEntraram[0]!.id, HOJE));
    expect(ka.custos.filter((k) => k.categoria === "Comissão")).toHaveLength(0);
  });

  it("recusa valor zero com a mensagem do repasse, não a da troca", async () => {
    const v = await tracker();
    await expect(comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: null,
      trocas: [{ ...KA_REPASSE, avaliacao: 0 }],
    }, b.usuarioId))).rejects.toThrow("Informe o valor de cada repasse recebido.");
  });

  it("desfazer a venda recusa mencionando repasse, não troca", async () => {
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: null,
      lancarComissoes: false, trocas: [KA_REPASSE],
    }, b.usuarioId));

    await expect(comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId)))
      .rejects.toThrow(/entrou o V-02 · Ford Ka como repasse/);
  });
});

describe("o repasse no painel e nos totais de venda", () => {
  it("conta como estoque normal enquanto está parado", async () => {
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: null,
      lancarComissoes: false, trocas: [KA_REPASSE],
    }, b.usuarioId));

    const p = await comLeitura((c) => painel(c, HOJE));
    // O Ka entrou por 1.000.000 e ainda não foi vendido: soma no estoque como
    // qualquer outro carro parado.
    expect(p.indicadores.emEstoque).toBe(1);
    expect(p.patrimonio.estoqueCusto).toBe(1_000_000);
  });

  it("some do painel e do consolidado de vendas quando ele mesmo é vendido", async () => {
    const v = await tracker();
    const venda1 = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-09-10", valorVenda: 8_000_000, contaId: null,
      lancarComissoes: false, trocas: [KA_REPASSE],
    }, b.usuarioId));
    const kaId = venda1.veiculosQueEntraram[0]!.id;

    // O Ka é repassado pelo mesmo valor que entrou — lucro zero por desenho.
    await comTransacao((c) => venderVeiculo(c, kaId, {
      dataVenda: "2026-09-11", valorVenda: 1_000_000, contaId: null, lancarComissoes: false,
    }, b.usuarioId));

    const { consolidado, veiculos } = await comLeitura((c) => consolidadoVendas(c, HOJE));
    // A Tracker sozinha: 1 vendido, não 2 — o Ka fica de fora da soma.
    expect(consolidado.vendidos).toBe(1);
    expect(consolidado.investido).toBe(6_700_000);
    expect(consolidado.faturado).toBe(8_000_000);
    // Mas a lista continua mostrando os dois, para a tabela identificar o Ka.
    expect(veiculos.map((x) => x.codigo).sort()).toEqual(["V-01", "V-02"]);
    expect(veiculos.find((x) => x.codigo === "V-02")?.origem).toBe("repasse");

    const p = await comLeitura((c) => painel(c, HOJE));
    expect(p.indicadores.lucroRealizado).toBe(1_300_000);   // só a Tracker: 8.000.000 − 6.700.000
    expect(p.indicadores.giroMedio).toBe(101);               // só o ciclo da Tracker
    expect(p.graficos.retornoPorCiclo.map((x) => x.codigo)).toEqual(["V-01"]);
  });
});
