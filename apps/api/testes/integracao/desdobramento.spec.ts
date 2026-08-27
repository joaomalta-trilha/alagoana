/**
 * O rastro da troca — pedido pela loja em 17/08/2026.
 *
 * O carro que entra na troca nasce de um negócio, e o resultado dele descende
 * desse negócio. Some do lucro do carro vendido — que é o certo, senão o
 * resultado da venda original cresceria com um carro que ainda nem vendeu —,
 * mas não pode sumir da vista.
 *
 * O exemplo da loja: Tracker vendida por 80.000 recebendo um Ka avaliado em
 * 20.000; o Ka leva 5.000 de custo e sai por 30.000. O lucro de 5.000 do Ka
 * aparece na ficha da Tracker, fora das contas dela.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { criarVeiculo, venderVeiculo } from "../../src/servicos/veiculos.js";
import { lancarCusto } from "../../src/servicos/custos.js";
import { ficha } from "../../src/servicos/consultas.js";
import { base, limpar, type Base } from "./fixtura.js";

const HOJE = "2026-08-17";
let b: Base;

const KA = {
  marca: "Ford", modelo: "Ka", cor: "Preto", placa: "KAA1A11",
  avaliacao: 2_000_000, modo: "avaliacao" as const, provisionarComissao: false as const,
};

async function trackerVendidaComKaNaTroca() {
  const tracker = await comTransacao((c) => criarVeiculo(c, {
    marca: "Chevrolet", modelo: "Tracker", cor: "Branco", placa: "TRK1A11",
    dataCompra: "2026-06-01", valorCompra: 6_700_000, contaId: null, provisionarComissao: false,
  }, b.usuarioId));

  const r = await comTransacao((c) => venderVeiculo(c, tracker.id, {
    dataVenda: "2026-07-01", valorVenda: 8_000_000, contaId: null,
    lancarComissoes: false, trocas: [KA],
  }, b.usuarioId));

  return { tracker, ka: r.veiculosQueEntraram[0]! };
}

beforeEach(async () => {
  await limpar();
  b = await base(10_000_000, 0);
});

afterAll(async () => { await pool.end(); });

describe("desdobramento da troca (§6.5)", () => {
  it("o Ka ainda no pátio aparece na ficha da Tracker, sem lucro", async () => {
    const { tracker, ka } = await trackerVendidaComKaNaTroca();

    const f = await comLeitura((c) => ficha(c, tracker.id, HOJE));
    expect(f.desdobramento.elos).toHaveLength(1);

    const elo = f.desdobramento.elos[0]!;
    expect(elo.codigo).toBe(ka.codigo);
    expect(elo.descricao).toBe("Ford Ka");
    expect(elo.nivel).toBe(1);
    expect(elo.veioDe).toBe("V-01");
    expect(elo.avaliacao).toBe(2_000_000);
    expect(elo.custoTotal).toBe(2_000_000);
    expect(elo.vendido).toBe(false);
    expect(elo.lucro).toBeNull();

    expect(f.desdobramento.emEstoque).toBe(1);
    expect(f.desdobramento.vendidos).toBe(0);
    expect(f.desdobramento.lucroRealizado).toBe(0);
    expect(f.desdobramento.custoEmEstoque).toBe(2_000_000);
  });

  it("vendido o Ka, o lucro dele aparece na ficha da Tracker", async () => {
    const { tracker, ka } = await trackerVendidaComKaNaTroca();

    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [ka.id], descricao: "Pintura", categoria: "Pintura",
      data: "2026-07-10", valor: 500_000, modoRateio: "mesmo",
      previsto: false, contaId: null,
    }, b.usuarioId));

    await comTransacao((c) => venderVeiculo(c, ka.id, {
      dataVenda: "2026-08-01", valorVenda: 3_000_000, contaId: null,
      lancarComissoes: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, tracker.id, HOJE));
    const elo = f.desdobramento.elos[0]!;
    expect(elo.vendido).toBe(true);
    expect(elo.valorVenda).toBe(3_000_000);
    expect(elo.custoTotal).toBe(2_500_000);        // 20.000 de entrada + 5.000
    expect(elo.lucro).toBe(500_000);               // os 5.000 do exemplo
    expect(f.desdobramento.lucroRealizado).toBe(500_000);
    expect(f.desdobramento.custoEmEstoque).toBe(0);
  });

  it("o lucro do Ka NÃO entra nas contas da Tracker", async () => {
    const { tracker, ka } = await trackerVendidaComKaNaTroca();
    await comTransacao((c) => venderVeiculo(c, ka.id, {
      dataVenda: "2026-08-01", valorVenda: 3_000_000, contaId: null,
      lancarComissoes: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, tracker.id, HOJE));
    // A Tracker custou 67.000 e saiu por 80.000: 13.000, e nada além disso.
    expect(f.custoTotal).toBe(6_700_000);
    expect(f.lucro).toBe(1_300_000);
    expect(f.desdobramento.lucroRealizado).toBe(1_000_000);
  });

  it("segue a cadeia inteira: o que entrou na troca do que entrou na troca", async () => {
    const { tracker, ka } = await trackerVendidaComKaNaTroca();

    // O Ka sai recebendo uma moto, que por sua vez é vendida.
    const r2 = await comTransacao((c) => venderVeiculo(c, ka.id, {
      dataVenda: "2026-08-01", valorVenda: 3_000_000, contaId: null, lancarComissoes: false,
      trocas: [{
        tipo: "moto", marca: "Yamaha", modelo: "Fazer 250", cor: "Azul",
        placa: "MOT9Z99", avaliacao: 800_000, modo: "avaliacao" as const, provisionarComissao: false,
      }],
    }, b.usuarioId));
    const moto = r2.veiculosQueEntraram[0]!;

    await comTransacao((c) => venderVeiculo(c, moto.id, {
      dataVenda: "2026-08-10", valorVenda: 1_000_000, contaId: null, lancarComissoes: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, tracker.id, HOJE));
    expect(f.desdobramento.elos.map((e) => [e.codigo, e.nivel, e.veioDe, e.lucro])).toEqual([
      ["V-02", 1, "V-01", 1_000_000],   // Ka: 30.000 − 20.000
      ["V-03", 2, "V-02", 200_000],     // moto: 10.000 − 8.000
    ]);
    expect(f.desdobramento.lucroRealizado).toBe(1_200_000);
    expect(f.desdobramento.vendidos).toBe(2);
  });

  it("na ficha do Ka, o desdobramento é o dele, não o da Tracker", async () => {
    const { ka } = await trackerVendidaComKaNaTroca();
    const f = await comLeitura((c) => ficha(c, ka.id, HOJE));

    expect(f.desdobramento.elos).toEqual([]);
    // E o vínculo para cima continua contando de onde ele veio.
    expect(f.troca.saiu?.descricao).toBe("Chevrolet Tracker");
    expect(f.origem).toBe("troca");
  });

  it("carro sem troca nenhuma tem desdobramento vazio", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "MOB1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.desdobramento).toEqual({
      elos: [], vendidos: 0, emEstoque: 0, lucroRealizado: 0, custoEmEstoque: 0,
    });
  });

  it("os dois recebidos de uma venda aparecem juntos", async () => {
    const tracker = await comTransacao((c) => criarVeiculo(c, {
      marca: "Chevrolet", modelo: "Tracker", cor: "Branco", placa: "TRK1A11",
      dataCompra: "2026-06-01", valorCompra: 6_700_000, contaId: null, provisionarComissao: false,
    }, b.usuarioId));

    await comTransacao((c) => venderVeiculo(c, tracker.id, {
      dataVenda: "2026-07-01", valorVenda: 8_000_000, contaId: null, lancarComissoes: false,
      trocas: [KA, {
        tipo: "moto", marca: "Yamaha", modelo: "Fazer 250", cor: "Azul",
        placa: "MOT9Z99", avaliacao: 600_000, modo: "avaliacao" as const, provisionarComissao: false,
      }],
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, tracker.id, HOJE));
    expect(f.desdobramento.elos.map((e) => [e.codigo, e.nivel])).toEqual([
      ["V-02", 1], ["V-03", 1],
    ]);
    expect(f.desdobramento.custoEmEstoque).toBe(2_600_000);
  });
});
