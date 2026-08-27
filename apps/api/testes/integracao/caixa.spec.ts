import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { registrarAporte } from "../../src/servicos/caixa.js";
import { criarVeiculo, venderVeiculo } from "../../src/servicos/veiculos.js";
import { lancarCusto } from "../../src/servicos/custos.js";
import {
  consolidadoVendas, listarVeiculos, painel, totalizar, visaoCaixa,
} from "../../src/servicos/consultas.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-08-09";
let b: Base;

beforeEach(async () => {
  await limpar();
  b = await base(5_907_476, 3_808_862);   // os saldos da §9: Alagoana e um sócio
});

afterAll(async () => { await pool.end(); });

describe("saldo é calculado, nunca armazenado (§3.2)", () => {
  it("sai de saldo_inicial mais a soma dos movimentos", async () => {
    expect(await saldo(b.alagoana)).toBe(5_907_476);

    await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana, provisionarComissao: false,
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(5_907_476 - 3_000_000);

    // Não existe coluna de saldo para conferir: se existisse, poderia divergir.
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) n from information_schema.columns
        where table_name = 'conta' and column_name = 'saldo'`);
    expect(rows[0]!.n).toBe("0");
  });
});

describe("aporte de sócio (§3.6)", () => {
  it("gera duas linhas: o dinheiro entrou e a participação aumentou", async () => {
    await comTransacao((c) => registrarAporte(c, {
      socioId: b.usuarioId, contaId: b.joao, data: "2026-08-01",
      tipo: "aporte", valor: 12_000_000, observacao: "Capital novo",
    }, b.usuarioId));

    expect(await saldo(b.joao)).toBe(3_808_862 + 12_000_000);

    const visao = await comLeitura((c) => visaoCaixa(c));
    const joao = visao.capitalPorSocio.find((s) => s.nome === "João")!;
    expect(joao.aportes).toBe(12_000_000);
    expect(joao.retiradas).toBe(0);
    expect(joao.capital).toBe(12_000_000);

    // O extrato ganhou a linha correspondente, e uma só.
    expect(visao.extrato.filter((m) => m.tipo === "aporte")).toHaveLength(1);
  });

  it("saldo em mãos e capital acumulado são números diferentes", async () => {
    await comTransacao((c) => registrarAporte(c, {
      socioId: b.usuarioId, contaId: b.joao, data: "2026-08-01",
      tipo: "aporte", valor: 12_000_000,
    }, b.usuarioId));
    await comTransacao((c) => registrarAporte(c, {
      socioId: b.usuarioId, contaId: b.joao, data: "2026-08-02",
      tipo: "retirada", valor: 2_000_000,
    }, b.usuarioId));

    const visao = await comLeitura((c) => visaoCaixa(c));
    const joao = visao.capitalPorSocio.find((s) => s.nome === "João")!;
    expect(joao.capital).toBe(10_000_000);                       // aportes − retiradas
    expect(await saldo(b.joao)).toBe(3_808_862 + 10_000_000);    // e o que há em mãos
  });

  it("retirada maior que o saldo é recusada com a mensagem da §8", async () => {
    await expect(comTransacao((c) => registrarAporte(c, {
      socioId: b.usuarioId, contaId: b.joao, data: "2026-08-01",
      tipo: "retirada", valor: 5_000_000,
    }, b.usuarioId))).rejects.toThrow("Saldo insuficiente em João: R$ 38.088,62.");

    // Nada gravado pela metade: nem movimento, nem aporte.
    const { rows } = await pool.query<{ m: string; a: string }>(
      `select (select count(*) from movimento_caixa) m, (select count(*) from aporte_socio) a`);
    expect(rows[0]).toEqual({ m: "0", a: "0" });
  });
});

describe("totais somados no backend, nunca na tela", () => {
  it("o consolidado de vendas fecha em si mesmo", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Honda", modelo: "City", cor: "Prata", placa: "CIT1A11",
      dataCompra: "2026-02-14", valorCompra: 8_400_000, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Preparação", categoria: "Peças",
      data: "2026-03-01", valor: 985_320,
    }, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000, lancarComissoes: false,
    }, b.usuarioId));

    const { consolidado } = await comLeitura((c) => consolidadoVendas(c, HOJE));
    expect(consolidado.compra).toBe(8_400_000);
    expect(consolidado.preparacao).toBe(985_320);
    // A identidade que a tela usava para recalcular, agora garantida na origem.
    expect(consolidado.compra + consolidado.preparacao).toBe(consolidado.investido);
    expect(consolidado.faturado - consolidado.investido).toBe(consolidado.lucro);
  });

  it("os totais da listagem batem com a soma dos itens", async () => {
    for (const [placa, valor] of [["AAA1A11", 3_000_000], ["BBB2B22", 5_000_000]] as const) {
      await comTransacao((c) => criarVeiculo(c, {
        marca: "Fiat", modelo: "Mobi", cor: "Branco", placa,
        dataCompra: "2026-06-01", valorCompra: valor, valorAnuncio: valor + 1_000_000, provisionarComissao: false,
    }, b.usuarioId));
    }

    const estoque = await comLeitura((c) => listarVeiculos(c, "estoque", HOJE));
    const totais = totalizar(estoque);
    expect(totais.quantidade).toBe(2);
    expect(totais.custoTotal).toBe(8_000_000);
    expect(totais.valorAnuncio).toBe(10_000_000);
  });

  it("veículo sem anúncio entra no total pelo próprio custo", async () => {
    await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, provisionarComissao: false,
    }, b.usuarioId));

    const totais = totalizar(await comLeitura((c) => listarVeiculos(c, "estoque", HOJE)));
    expect(totais.valorAnuncio).toBe(totais.custoTotal);
  });
});

describe("painel (§6.2 e §4.7)", () => {
  it("patrimônio é caixa mais estoque ao custo, e a projeção é separada", async () => {
    const emEstoque = await comTransacao((c) => criarVeiculo(c, {
      marca: "Ford", modelo: "EcoSport", cor: "Prata", placa: "ECO1A11",
      dataCompra: "2026-05-01", valorCompra: 5_200_000, valorAnuncio: 6_800_000, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [emEstoque.id], descricao: "Preparação", categoria: "Peças",
      data: "2026-05-10", valor: 621_962,
    }, b.usuarioId));

    const p = await comLeitura((c) => painel(c, HOJE));
    const caixa = 5_907_476 + 3_808_862;

    expect(p.patrimonio.caixaTotal).toBe(caixa);
    expect(p.patrimonio.estoqueCusto).toBe(5_821_962);
    expect(p.patrimonio.patrimonioTotal).toBe(caixa + 5_821_962);
    expect(p.patrimonio.lucroNaoRealizado).toBe(6_800_000 - 5_821_962);
    expect(p.patrimonio.patrimonioFuturo)
      .toBe(p.patrimonio.patrimonioTotal + p.patrimonio.lucroNaoRealizado);
  });

  it("os indicadores separam o que é fato do que é estoque", async () => {
    const vendido = await comTransacao((c) => criarVeiculo(c, {
      marca: "Honda", modelo: "City", cor: "Prata", placa: "CIT1A11",
      dataCompra: "2026-02-14", valorCompra: 8_400_000, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [vendido.id], descricao: "Preparação", categoria: "Peças",
      data: "2026-03-01", valor: 985_320,
    }, b.usuarioId));
    await comTransacao((c) => venderVeiculo(c, vendido.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000, lancarComissoes: false,
    }, b.usuarioId));

    // Um parado há mais de 90 dias.
    await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "MOB1A11",
      dataCompra: "2026-01-05", valorCompra: 3_000_000, provisionarComissao: false,
    }, b.usuarioId));

    const p = await comLeitura((c) => painel(c, HOJE));
    expect(p.indicadores.emEstoque).toBe(1);
    expect(p.indicadores.parados90).toBe(1);
    expect(p.indicadores.lucroRealizado).toBe(314_680);
    expect(p.indicadores.giroMedio).toBe(170);
    expect(p.indicadores.retornoMedio).toBeCloseTo(3.35, 2);
    expect(p.indicadores.emGarantia).toBe(1);

    expect(p.graficos.envelhecimento.find((f) => f.faixa === "90+")?.quantidade).toBe(1);
    expect(p.graficos.resultadoPorMes).toEqual([
      { mes: "2026-08", lucro: 314_680, quantidade: 1 },
    ]);
  });
});
