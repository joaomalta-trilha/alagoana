/**
 * Cada `it` aqui é uma frase da especificação virada em teste. Quando uma
 * fórmula mudar, é aqui que a conversa começa.
 */

import { describe, it, expect } from "vitest";
import {
  custoTotal, lucro, retornoPct, cicloDias, retornoMes, lucroProjetado,
  depreciacao, depreciacaoPct, anuncioVsFipe,
  faixaIdade, preenchimentoIdade, garantia, calcularTroca, patrimonio,
  diasEntre, somarDias,
} from "../../src/dominio/veiculo.js";

const HOJE = "2026-08-08";

describe("4.1 custo e resultado", () => {
  // Honda City: o exemplo que a especificação escreve por extenso.
  const compra = 8_400_000;
  const preparacao = 985_320;
  const venda = 9_700_000;

  it("custo total é compra mais preparação", () => {
    expect(custoTotal(compra, preparacao)).toBe(9_385_320); // 93.853,20
  });

  it("lucro é venda menos custo total", () => {
    expect(lucro(venda, custoTotal(compra, preparacao))).toBe(314_680); // 3.146,80
  });

  it("retorno é sobre o investido, não sobre a venda", () => {
    const total = custoTotal(compra, preparacao);
    expect(retornoPct(lucro(venda, total), total)).toBeCloseTo(3.35, 2);
    // sobre a venda daria 3,24% — é o erro que este teste existe para pegar
    expect(lucro(venda, total) / venda * 100).not.toBeCloseTo(3.35, 2);
  });

  it("ciclo do Honda City é 170 dias", () => {
    expect(cicloDias("2026-02-14", "2026-08-03", HOJE)).toBe(170);
  });

  it("retorno por mês em pátio é 0,59%", () => {
    expect(retornoMes(3.3529, 170)).toBeCloseTo(0.59, 2);
  });

  it("não exibe retorno mensal abaixo de 15 dias, porque o número explode", () => {
    expect(retornoMes(5, 14)).toBeNull();
    expect(retornoMes(5, 15)).not.toBeNull();
  });

  it("carro em estoque conta o ciclo até hoje", () => {
    expect(cicloDias("2026-06-26", null, HOJE)).toBe(43);
  });

  it("lucro projetado só existe quando há anúncio", () => {
    expect(lucroProjetado(8_900_000, 7_118_346)).toBe(1_781_654);
    expect(lucroProjetado(null, 7_118_346)).toBeNull();
  });
});

describe("4.2 fipe", () => {
  it("depreciação é movimento de mercado e não entra no lucro", () => {
    expect(depreciacao(10_543_700, 10_000_000)).toBe(-543_700);
    expect(depreciacaoPct(10_543_700, 10_000_000)).toBeCloseTo(-5.16, 2);
  });

  it("sem fipe preenchida não há depreciação", () => {
    expect(depreciacao(null, 10_000_000)).toBeNull();
    expect(depreciacaoPct(10_543_700, null)).toBeNull();
  });

  it("anúncio contra a fipe de hoje", () => {
    expect(anuncioVsFipe(8_900_000, 9_207_900)).toBeCloseTo(-3.34, 2);
  });
});

describe("4.3 envelhecimento do estoque", () => {
  it("90 dias ainda é âmbar; 91 já é vermelho", () => {
    expect(faixaIdade(30)).toBe("0-30");
    expect(faixaIdade(31)).toBe("31-60");
    expect(faixaIdade(90)).toBe("61-90");
    expect(faixaIdade(91)).toBe("90+");
  });

  it("a barra satura em 120 dias", () => {
    expect(preenchimentoIdade(60)).toBe(50);
    expect(preenchimentoIdade(120)).toBe(100);
    expect(preenchimentoIdade(300)).toBe(100);
  });
});

describe("4.4 garantia", () => {
  it("são 90 dias corridos a partir da venda", () => {
    const g = garantia("2026-08-03", HOJE);
    expect(g.fim).toBe("2026-11-01");
    expect(g.diasRestantes).toBe(85);
    expect(g.ativa).toBe(true);
  });

  it("encerra quando não restam dias", () => {
    expect(garantia("2026-05-10", HOJE).ativa).toBe(false);
    // no 90º dia exato já está encerrada
    expect(garantia("2026-05-10", "2026-08-08").diasRestantes).toBe(0);
  });

  it("o preenchimento fica entre 0 e 100", () => {
    expect(garantia("2026-08-08", HOJE).preenchimento).toBe(0);
    expect(garantia("2020-01-01", HOJE).preenchimento).toBe(100);
  });
});

describe("4.5 venda com troca", () => {
  // Tracker vendido a 89.000 com custo total 71.183,46, recebendo um Argo
  // avaliado em 44.000 e valendo 40.000.
  const VENDA = 8_900_000;
  const CUSTO_TRACKER = 7_118_346;
  const AVALIACAO = 4_400_000;
  const MERCADO = 4_000_000;

  it("pela avaliação: o ágio fica embutido no carro que entra", () => {
    const t = calcularTroca(VENDA, AVALIACAO, MERCADO, "avaliacao");
    expect(t.valorCompraEntrada).toBe(4_400_000);
    expect(t.custoAgioNoVendido).toBe(0);
    expect(lucro(VENDA, CUSTO_TRACKER + t.custoAgioNoVendido)).toBe(1_781_654); // 17.816,54
  });

  it("pelo mercado: o ágio vira custo desta venda", () => {
    const t = calcularTroca(VENDA, AVALIACAO, MERCADO, "mercado");
    expect(t.valorCompraEntrada).toBe(4_000_000);
    expect(t.agio).toBe(400_000);
    expect(t.custoAgioNoVendido).toBe(400_000);
    expect(lucro(VENDA, CUSTO_TRACKER + t.custoAgioNoVendido)).toBe(1_381_654); // 13.816,54
  });

  it("o caixa recebe 45.000 nos dois modos — o modo move resultado, não dinheiro", () => {
    for (const modo of ["avaliacao", "mercado"] as const) {
      expect(calcularTroca(VENDA, AVALIACAO, MERCADO, modo).entradaEmCaixa).toBe(4_500_000);
    }
  });

  it("sem valor de mercado informado, o ágio é zero", () => {
    const t = calcularTroca(9_000_000, 5_000_000, null, "mercado");
    expect(t.agio).toBe(0);
    expect(t.valorCompraEntrada).toBe(5_000_000);
    expect(t.entradaEmCaixa).toBe(4_000_000); // o exemplo do cliente
  });

  it("avaliação acima da venda deixa o caixa negativo — a loja pagou a diferença", () => {
    expect(calcularTroca(3_000_000, 4_000_000, null, "avaliacao").entradaEmCaixa).toBe(-1_000_000);
  });

  it("avaliar abaixo do mercado não gera ágio negativo", () => {
    expect(calcularTroca(9_000_000, 4_000_000, 4_500_000, "mercado").agio).toBe(0);
  });
});

describe("4.7 patrimônio", () => {
  it("reproduz a conferência da carga inicial", () => {
    const p = patrimonio(9_716_338, [
      { custoTotal: 5_821_962, valorAnuncio: 6_800_000 }, // EcoSport
      { custoTotal: 7_118_346, valorAnuncio: 8_900_000 }, // Tracker
      { custoTotal: 4_156_000, valorAnuncio: 4_900_000 }, // HB20
      { custoTotal: 3_251_300, valorAnuncio: 4_000_000 }, // Ka Sedan
      { custoTotal: 6_561_000, valorAnuncio: 7_100_000 }, // Yaris
    ]);
    expect(p.estoqueCusto).toBe(26_908_608);      // 269.086,08
    expect(p.patrimonioTotal).toBe(36_624_946);   // 366.249,46
    expect(p.estoqueAnuncio).toBe(31_700_000);    // 317.000,00
    expect(p.lucroNaoRealizado).toBe(4_791_392);  //  47.913,92
    expect(p.patrimonioFuturo).toBe(41_416_338);  // 414.163,38
  });

  it("carro sem anúncio entra na projeção pelo próprio custo", () => {
    const p = patrimonio(0, [{ custoTotal: 5_000_000, valorAnuncio: null }]);
    expect(p.lucroNaoRealizado).toBe(0);
  });
});

describe("datas de negócio", () => {
  it("não escorregam um dia por causa de fuso", () => {
    // O clássico: new Date('2026-08-03') é meia-noite UTC, que em Maceió
    // (UTC−3) é 02/08 às 21h. Se isto quebrar, ciclo e garantia quebram junto.
    expect(diasEntre("2026-02-14", "2026-08-03")).toBe(170);
    expect(somarDias("2026-08-03", 90)).toBe("2026-11-01");
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01"); // 2026 não é bissexto
  });
});
