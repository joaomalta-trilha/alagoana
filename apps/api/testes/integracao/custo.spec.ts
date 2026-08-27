import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { criarVeiculo, venderVeiculo } from "../../src/servicos/veiculos.js";
import { atalhos, excluirCusto, lancarCusto } from "../../src/servicos/custos.js";
import { ficha } from "../../src/servicos/consultas.js";
import { MSG } from "../../src/dominio/mensagens.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-08-09";
let b: Base;

beforeEach(async () => {
  await limpar();
  b = await base(50_000_000);
});

afterAll(async () => { await pool.end(); });

/** Compra pela conta da empresa, para o saldo ter história antes do custo. */
async function carro(placa: string, marca = "Fiat", modelo = "Mobi") {
  return comTransacao((c) => criarVeiculo(c, {
    marca, modelo, cor: "Branco", placa,
    dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: b.alagoana, provisionarComissao: false,
  }, b.usuarioId));
}

describe("rateio (§6.7)", () => {
  it("o caso real: 369,46 de tráfego pago em três carros", async () => {
    const carros = [await carro("AAA1A11"), await carro("BBB2B22"), await carro("CCC3C33")];

    const lancados = await comTransacao((c) => lancarCusto(c, {
      veiculoIds: carros.map((v) => v.id),
      descricao: "Tráfego pago", categoria: "Patrocinado",
      data: "2026-08-01", valor: 36_946, modoRateio: "dividir",
      contaId: b.alagoana,
    }, b.usuarioId));

    expect(lancados.map((k) => k.valor)).toEqual([12_316, 12_315, 12_315]);
    // A soma tem de bater com o que saiu da conta, ao centavo.
    expect(lancados.reduce((a, k) => a + k.valor, 0)).toBe(36_946);
    expect(await saldo(b.alagoana)).toBe(50_000_000 - 3 * 3_000_000 - 36_946);
  });

  it("modo 'mesmo' repete o valor inteiro em cada carro", async () => {
    const carros = [await carro("AAA1A11"), await carro("BBB2B22")];
    const lancados = await comTransacao((c) => lancarCusto(c, {
      veiculoIds: carros.map((v) => v.id),
      descricao: "Lavagem", categoria: "Serviço",
      data: "2026-08-01", valor: 5_000, modoRateio: "mesmo",
    }, b.usuarioId));

    expect(lancados.map((k) => k.valor)).toEqual([5_000, 5_000]);
  });

  it("rateio sem carro nenhum recusa com a mensagem da §8", async () => {
    await expect(comTransacao((c) => lancarCusto(c, {
      veiculoIds: [], descricao: "Tráfego pago", categoria: "Patrocinado",
      data: "2026-08-01", valor: 36_946,
    }, b.usuarioId))).rejects.toThrow(MSG.rateioSemSelecao);
  });
});

describe("validações da §8", () => {
  it("custo incompleto: sem descrição, sem data ou com valor zero", async () => {
    const v = await carro("AAA1A11");
    const campos = [
      { descricao: "", data: "2026-08-01", valor: 5_000 },
      { descricao: "Lavagem", data: null, valor: 5_000 },
      { descricao: "Lavagem", data: "2026-08-01", valor: 0 },
    ];
    for (const parcial of campos) {
      await expect(comTransacao((c) => lancarCusto(c, {
        veiculoIds: [v.id], categoria: "Serviço", ...parcial,
      }, b.usuarioId))).rejects.toThrow(MSG.custoIncompleto);
    }
  });

  it("Retorno só entra em carro já vendido", async () => {
    const v = await carro("AAA1A11");

    await expect(comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Troca de embreagem", categoria: "Retorno",
      data: "2026-08-05", valor: 120_000,
    }, b.usuarioId))).rejects.toThrow(MSG.retornoEmPatio);

    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-07-01", valorVenda: 3_500_000, lancarComissoes: false,
    }, b.usuarioId));

    // Agora passa — e reduz o lucro de um carro já vendido (§4.4).
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Troca de embreagem", categoria: "Retorno",
      data: "2026-08-05", valor: 120_000,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.lucro).toBe(3_500_000 - 3_000_000 - 120_000);
  });

  it("'Não detalhado' não pode ser lançada — existe só para a carga inicial", async () => {
    const v = await carro("AAA1A11");
    await expect(comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Sem detalhe", categoria: "Não detalhado",
      data: "2026-08-01", valor: 5_000,
    }, b.usuarioId))).rejects.toThrow(/carga inicial/);
  });

  it("categoria inventada é recusada pelo domínio, antes do banco", async () => {
    const v = await carro("AAA1A11");
    await expect(comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Lavagem", categoria: "Estética",
      data: "2026-08-01", valor: 5_000,
    }, b.usuarioId))).rejects.toThrow(/Categoria desconhecida/);
  });
});

describe("custo previsto (§3.4)", () => {
  it("entra no custo total sem data e sem tocar no caixa", async () => {
    const v = await carro("AAA1A11");
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Comissão Victor", categoria: "Comissão",
      data: null, previsto: true, valor: 50_000, contaId: b.alagoana,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custoTotal).toBe(3_050_000);
    expect(f.custos[0]!.prevista).toBe(true);
    // O caixa só sentiu a compra: custo previsto ainda não aconteceu.
    expect(await saldo(b.alagoana)).toBe(50_000_000 - 3_000_000);
  });
});

describe("exclusão de custo (§4.8)", () => {
  it("remove o movimento vinculado e devolve o valor ao saldo", async () => {
    const v = await carro("AAA1A11");
    const [lancado] = await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Pintura", categoria: "Pintura",
      data: "2026-06-10", valor: 150_000, contaId: b.alagoana,
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(50_000_000 - 3_000_000 - 150_000);

    const r = await comTransacao((c) => excluirCusto(c, lancado!.id, b.usuarioId));
    expect(r.devolvidoAoCaixa).toBe(150_000);
    expect(await saldo(b.alagoana)).toBe(50_000_000 - 3_000_000);

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custoTotal).toBe(3_000_000);
  });
});

describe("atalhos do lançamento rápido (§6.7)", () => {
  it("agrupa por descrição e categoria e sugere o valor mais comum", async () => {
    const carros = [await carro("AAA1A11"), await carro("BBB2B22"), await carro("CCC3C33")];

    for (const [i, valor] of [12_000, 12_000, 15_000].entries()) {
      await comTransacao((c) => lancarCusto(c, {
        veiculoIds: [carros[i]!.id], descricao: "Lavagem completa", categoria: "Serviço",
        data: "2026-07-01", valor,
      }, b.usuarioId));
    }
    // Um lançamento único não vira atalho: atalho é o que se repete.
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [carros[0]!.id], descricao: "Guincho da Serra", categoria: "Guincho",
      data: "2026-07-02", valor: 30_000,
    }, b.usuarioId));

    const lista = await comLeitura((c) => atalhos(c));
    expect(lista).toEqual([
      { descricao: "Lavagem completa", categoria: "Serviço", repeticoes: 3, valor: 12_000 },
    ]);
  });
});
