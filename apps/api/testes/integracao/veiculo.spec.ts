/**
 * Os exemplos numéricos da especificação, ponta a ponta contra o Postgres.
 *
 * Os testes de `dominio/veiculo.spec.ts` provam as fórmulas isoladas. Estes
 * provam que gravar, ler de volta e recalcular chega no mesmo número — que é
 * onde um `numeric` mal convertido apareceria.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { criarVeiculo, editarVeiculo, excluirVeiculo, previaExclusao, venderVeiculo }
  from "../../src/servicos/veiculos.js";
import { lancarCusto } from "../../src/servicos/custos.js";
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

/** Honda City da carga inicial: 84.000 de compra e 9.853,20 de preparação. */
async function hondaCity(contaId: string | null = null) {
  const v = await comTransacao((c) => criarVeiculo(c, {
    marca: "Honda", modelo: "City", cor: "Prata", placa: "abc1d23",
    dataCompra: "2026-02-14", valorCompra: 8_400_000, contaId,
  }, b.usuarioId));

  await comTransacao((c) => lancarCusto(c, {
    veiculoIds: [v.id], descricao: "Preparação", categoria: "Peças",
    data: "2026-03-01", valor: 985_320, contaId,
  }, b.usuarioId));

  return v;
}

describe("cadastro", () => {
  it("gera código sequencial e grava a placa em maiúsculas", async () => {
    const primeiro = await hondaCity();
    expect(primeiro.codigo).toBe("V-01");

    const segundo = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "xyz9k88",
      dataCompra: "2026-05-01", valorCompra: 3_000_000,
    }, b.usuarioId));
    expect(segundo.codigo).toBe("V-02");

    const f = await comLeitura((c) => ficha(c, primeiro.id, HOJE));
    expect(f.placa).toBe("ABC1D23");
  });

  it("recusa cadastro incompleto com a mensagem da §8", async () => {
    await expect(comTransacao((c) => criarVeiculo(c, {
      marca: "Honda", modelo: "", cor: "Prata", placa: "ABC1D23",
      dataCompra: "2026-02-14", valorCompra: 8_400_000,
    }, b.usuarioId))).rejects.toThrow(MSG.veiculoIncompleto);

    await expect(comTransacao((c) => criarVeiculo(c, {
      marca: "Honda", modelo: "City", cor: "Prata", placa: "ABC1D23",
      dataCompra: "2026-02-14", valorCompra: 0,
    }, b.usuarioId))).rejects.toThrow(MSG.veiculoIncompleto);
  });

  it("a marca e o modelo novos entram no catálogo — o '+ Outra…' da §3.7", async () => {
    await hondaCity();
    const { rows } = await pool.query<{ marca: string; modelo: string }>(
      "select m.nome marca, mo.nome modelo from modelo mo join marca m on m.id = mo.marca_id");
    expect(rows).toEqual([{ marca: "Honda", modelo: "City" }]);
  });

  it("com conta escolhida, o caixa é debitado; sem conta, não", async () => {
    await hondaCity(b.alagoana);
    // Sai a compra e sai o custo: os dois passam pela conta escolhida.
    expect(await saldo(b.alagoana)).toBe(50_000_000 - 8_400_000 - 985_320);

    await limpar();
    b = await base(50_000_000);
    await hondaCity(null);
    expect(await saldo(b.alagoana)).toBe(50_000_000);
  });

  it("saldo insuficiente recusa com a mensagem exata da §8", async () => {
    await limpar();
    b = await base(10_000);   // R$ 100,00

    await expect(comTransacao((c) => criarVeiculo(c, {
      marca: "Honda", modelo: "City", cor: "Prata", placa: "ABC1D23",
      dataCompra: "2026-02-14", valorCompra: 8_400_000, contaId: b.alagoana,
    }, b.usuarioId))).rejects.toThrow("Saldo insuficiente em Alagoana: R$ 100,00.");

    // A transação inteira voltou atrás: nem veículo, nem movimento.
    const { rows } = await pool.query<{ n: string }>("select count(*) n from veiculo");
    expect(rows[0]!.n).toBe("0");
  });
});

describe("venda — o Honda City da especificação", () => {
  it("custo total, lucro, retorno e ciclo batem com a §4.1", async () => {
    const v = await hondaCity();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000, lancarComissoes: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custoTotal).toBe(9_385_320);        //  93.853,20
    expect(f.lucro).toBe(314_680);               //   3.146,80
    expect(f.retornoPct).toBeCloseTo(3.35, 2);
    expect(f.cicloDias).toBe(170);
    expect(f.retornoMes).toBeCloseTo(0.59, 2);
    expect(f.garantia?.fim).toBe("2026-11-01");  // 90 dias corridos (§4.4)
  });

  it("recusa data de venda anterior à compra com a mensagem da §8", async () => {
    const v = await hondaCity();
    await expect(comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-01-01", valorVenda: 9_700_000,
    }, b.usuarioId))).rejects.toThrow(MSG.vendaAntesDaCompra);
  });

  it("não vende duas vezes", async () => {
    const v = await hondaCity();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000, lancarComissoes: false,
    }, b.usuarioId));
    await expect(comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-04", valorVenda: 9_700_000,
    }, b.usuarioId))).rejects.toThrow(/já foi vendido/);
  });
});

describe("comissões (§4.6)", () => {
  it("vêm marcadas por padrão e lançam uma linha de 1.500", async () => {
    const v = await hondaCity();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000,
    }, b.usuarioId));

    // Eram duas linhas, 1.000 + 500, até 17/08/2026. O total não mudou.
    expect(r.comissoesLancadas.map((k) => k.valor)).toEqual([150_000]);
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.custoTotal).toBe(9_385_320 + 150_000);
  });

  it("vêm desmarcadas quando já foram provisionadas na entrada", async () => {
    const v = await hondaCity();
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Comissão Alagoana", categoria: "Comissão",
      data: null, previsto: true, valor: 100_000,
    }, b.usuarioId));

    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000,
    }, b.usuarioId));
    expect(r.comissoesLancadas).toEqual([]);
  });
});

describe("venda com troca (§4.5) — o Tracker da especificação", () => {
  /** Tracker: 67.000 de compra e 4.183,46 de preparação = 71.183,46. */
  async function tracker() {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Chevrolet", modelo: "Tracker", cor: "Preto", placa: "TRK1A23",
      dataCompra: "2026-04-01", valorCompra: 6_700_000,
    }, b.usuarioId));
    await comTransacao((c) => lancarCusto(c, {
      veiculoIds: [v.id], descricao: "Preparação", categoria: "Peças",
      data: "2026-04-10", valor: 418_346,
    }, b.usuarioId));
    return v;
  }

  const argo = {
    marca: "Fiat", modelo: "Argo", cor: "Branco", placa: "ARG2B34",
    avaliacao: 4_400_000, mercado: 4_000_000,
  };

  it("pela avaliação: lucro 17.816,54 e o Argo entra por 44.000", async () => {
    const v = await tracker();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 8_900_000, lancarComissoes: false,
      contaId: b.alagoana, troca: { ...argo, modo: "avaliacao" },
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.lucro).toBe(1_781_654);                       // 17.816,54

    const entrou = await comLeitura((c) => ficha(c, r.veiculoQueEntrou!.id, HOJE));
    expect(entrou.valorCompra).toBe(4_400_000);
    expect(entrou.origem).toBe("troca");
    expect(entrou.troca.saiu?.codigo).toBe(f.codigo);      // vínculo no sentido inverso
    expect(f.troca.entrou?.codigo).toBe(entrou.codigo);
  });

  it("pelo mercado: o ágio vira custo e o lucro cai para 13.816,54", async () => {
    const v = await tracker();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 8_900_000, lancarComissoes: false,
      contaId: b.alagoana, troca: { ...argo, modo: "mercado" },
    }, b.usuarioId));

    expect(r.agio).toBe(400_000);
    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.lucro).toBe(1_381_654);                       // 13.816,54
    expect(f.custos.find((k) => k.categoria === "Troca")?.valor).toBe(400_000);

    const entrou = await comLeitura((c) => ficha(c, r.veiculoQueEntrou!.id, HOJE));
    expect(entrou.valorCompra).toBe(4_000_000);
  });

  it("o caixa recebe 45.000 nos dois modos — o modo move resultado, não dinheiro", async () => {
    for (const modo of ["avaliacao", "mercado"] as const) {
      await limpar();
      b = await base(50_000_000);
      const v = await tracker();
      const antes = await saldo(b.alagoana);

      await comTransacao((c) => venderVeiculo(c, v.id, {
        dataVenda: "2026-08-03", valorVenda: 8_900_000, lancarComissoes: false,
        contaId: b.alagoana, troca: { ...argo, modo },
      }, b.usuarioId));

      expect(await saldo(b.alagoana) - antes).toBe(4_500_000);
    }
  });
});

describe("edição (§4.8)", () => {
  it("mudar o valor de compra reescreve o movimento vinculado", async () => {
    const v = await hondaCity(b.alagoana);
    const antes = await saldo(b.alagoana);

    await comTransacao((c) => editarVeiculo(c, v.id, { valorCompra: 8_000_000 }, b.usuarioId));

    // O extrato não pode contar história diferente da ficha: 4.000 a menos de
    // compra são 4.000 a mais na conta.
    expect(await saldo(b.alagoana)).toBe(antes + 400_000);
    const { rows } = await pool.query<{ n: string }>(
      "select count(*) n from movimento_caixa where tipo = 'compra'");
    expect(rows[0]!.n).toBe("1");   // reescrito, não duplicado
  });

  it("não cria movimento em veículo lançado sem conta", async () => {
    const v = await hondaCity(null);
    await comTransacao((c) => editarVeiculo(c, v.id, { valorCompra: 8_000_000 }, b.usuarioId));
    expect(await saldo(b.alagoana)).toBe(50_000_000);
  });

  it("recusa venda anterior à compra", async () => {
    const v = await hondaCity();
    await expect(comTransacao((c) => editarVeiculo(c, v.id, {
      dataVenda: "2026-01-01", valorVenda: 9_000_000,
    }, b.usuarioId))).rejects.toThrow(MSG.vendaAntesDaCompra);
  });
});

describe("exclusão (§4.8)", () => {
  it("a prévia traz os números reais do estrago", async () => {
    const v = await hondaCity(b.alagoana);
    const previa = await comLeitura((c) => previaExclusao(c, v.id));

    expect(previa.codigo).toBe("V-01");
    expect(previa.custos).toEqual({ quantidade: 1, soma: 985_320 });
    expect(previa.movimentos.quantidade).toBe(2);            // compra e custo
    expect(previa.movimentos.valorDevolvido).toBe(8_400_000 + 985_320);
    expect(previa.venda).toBeNull();
  });

  it("leva custos e movimentos junto e devolve o saldo", async () => {
    const v = await hondaCity(b.alagoana);
    await comTransacao((c) => excluirVeiculo(c, v.id, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(50_000_000);
    const { rows } = await pool.query<{ custos: string; movimentos: string }>(
      "select (select count(*) from custo) custos, (select count(*) from movimento_caixa) movimentos");
    expect(rows[0]).toEqual({ custos: "0", movimentos: "0" });
  });

  it("o carro que entrou por troca sobrevive, só perde o vínculo", async () => {
    const v = await hondaCity();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-03", valorVenda: 9_700_000, lancarComissoes: false,
      troca: {
        marca: "Fiat", modelo: "Argo", cor: "Branco", placa: "ARG2B34",
        avaliacao: 4_400_000, modo: "avaliacao",
      },
    }, b.usuarioId));

    await comTransacao((c) => excluirVeiculo(c, v.id, b.usuarioId));

    const sobrevivente = await comLeitura((c) => ficha(c, r.veiculoQueEntrou!.id, HOJE));
    expect(sobrevivente.troca.saiu).toBeNull();
    expect(sobrevivente.origem).toBe("troca");   // o fato histórico permanece
  });
});
