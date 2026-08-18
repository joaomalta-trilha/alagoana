import { describe, it, expect } from "vitest";
import {
  COMISSOES_PADRAO, lerComissoes, marcarComissoesPorPadrao,
} from "../../src/dominio/comissao.js";
import { MSG, saldoInsuficiente } from "../../src/dominio/mensagens.js";

describe("comissões (§4.6)", () => {
  it("o padrão da casa é uma linha só, de 1.500", () => {
    expect(COMISSOES_PADRAO).toEqual([
      { beneficiario: "Comissão Alagoana", valor: 150_000 },
    ]);
  });

  it("o checkbox vem marcado, exceto quando já foram provisionadas", () => {
    expect(marcarComissoesPorPadrao(false)).toBe(true);
    expect(marcarComissoesPorPadrao(true)).toBe(false);
  });

  it("lê o que está em config e cai no padrão quando o conteúdo não serve", () => {
    expect(lerComissoes([{ beneficiario: "Comissão João", valor: 70_000 }]))
      .toEqual([{ beneficiario: "Comissão João", valor: 70_000 }]);

    for (const lixo of [null, "texto", [], [{ beneficiario: "X", valor: 0 }],
                        [{ beneficiario: "X", valor: 1.5 }], [{ valor: 100 }]]) {
      expect(lerComissoes(lixo)).toEqual(COMISSOES_PADRAO);
    }
  });
});

describe("mensagens da §8", () => {
  it("são as frases exatas da especificação", () => {
    expect(MSG.custoIncompleto).toBe("Preencha descrição, data e um valor maior que zero.");
    expect(MSG.retornoEmPatio).toBe("Retorno só pode ser lançado em carro já vendido.");
    expect(MSG.veiculoIncompleto).toBe(
      "Preencha marca, modelo, placa, data de compra e um valor de compra maior que zero.");
    expect(MSG.vendaAntesDaCompra).toBe("A data da venda não pode ser anterior à da compra.");
    expect(MSG.rateioSemSelecao).toBe("Selecione pelo menos um carro para o rateio.");
  });

  it("saldo insuficiente traz o nome da conta e o valor formatado", () => {
    expect(saldoInsuficiente("Alagoana", 5_907_476))
      .toBe("Saldo insuficiente em Alagoana: R$ 59.074,76.");
    expect(saldoInsuficiente("João", 0)).toBe("Saldo insuficiente em João: R$ 0,00.");
  });
});
