/**
 * As regras de casamento com a Fipe.
 *
 * Todos os casos abaixo saíram da frota real e da API de verdade, medidos
 * antes de escrever o código: são os que quebraram a primeira regra que eu
 * tentei (prefixo) e a razão de a regra ser por palavra.
 */

import { describe, it, expect } from "vitest";
import {
  tipoFipe, normalizar, casarMarca, candidatosDeModelo,
  valorParaCentavos, anoDaFipe, tabelaMudou,
} from "../../src/dominio/fipe.js";

const MARCAS_CARRO = [
  { codigo: "22", nome: "Fiat" },
  { codigo: "23", nome: "GM - Chevrolet" },
  { codigo: "26", nome: "Hyundai" },
  { codigo: "59", nome: "VW - VolksWagen" },
  { codigo: "43", nome: "Kia Motors" },
  { codigo: "156", nome: "MINI" },
];

describe("qual tabela da Fipe", () => {
  it("carro e moto têm tabela; outro não tem", () => {
    expect(tipoFipe("carro")).toBe("carros");
    expect(tipoFipe("moto")).toBe("motos");
    expect(tipoFipe("outro")).toBeNull();
  });
});

describe("casar a marca", () => {
  it("casa direto quando o nome é o mesmo", () => {
    expect(casarMarca("Fiat", MARCAS_CARRO)).toBe("22");
    expect(casarMarca("Hyundai", MARCAS_CARRO)).toBe("26");
  });

  it("ignora caixa — a Fipe grita o nome das marcas de moto", () => {
    expect(casarMarca("Mini", MARCAS_CARRO)).toBe("156");
    expect(casarMarca("YAMAHA", [{ codigo: "77", nome: "Yamaha" }])).toBe("77");
  });

  it("conhece os três apelidos que nenhuma regra genérica acerta", () => {
    expect(casarMarca("Chevrolet", MARCAS_CARRO)).toBe("23");
    expect(casarMarca("Volkswagen", MARCAS_CARRO)).toBe("59");
    expect(casarMarca("Kia", MARCAS_CARRO)).toBe("43");
  });

  it("devolve nulo quando não há par, em vez de chutar o parecido", () => {
    expect(casarMarca("Lada", MARCAS_CARRO)).toBeNull();
  });
});

describe("candidatos de modelo", () => {
  // Os nomes abaixo são literais da API da Fipe.
  const FORD = [
    { nome: "Ka 1.0 SE/SE Plus TiVCT Flex 5p" },
    { nome: "Ka 1.5 Sedan SE 12V Flex 4p Mec." },
    { nome: "Ka+ Sedan 1.5 SEL 16V Flex 4p" },
    { nome: "Fiesta 1.0 8V Flex 5p" },
    { nome: "EcoSport XLS 1.6 8V" },
  ];

  it("acha 'Ka Sedan', que um prefixo não acharia", () => {
    const c = candidatosDeModelo("Ka Sedan", FORD).map((x) => x.nome);
    expect(c).toEqual([
      "Ka 1.5 Sedan SE 12V Flex 4p Mec.",
      "Ka+ Sedan 1.5 SEL 16V Flex 4p",
    ]);
  });

  it("acha 'Fazer 250' no meio do nome", () => {
    const motos = [
      { nome: "YS 250 FAZER/ FAZER L. EDITION /BLUEFLEX" },
      { nome: "FZ25 250 FAZER FLEX" },
      { nome: "FZ15 150 FAZER FLEX" },
      { nome: "XTZ 250 LANDER" },
    ];
    expect(candidatosDeModelo("Fazer 250", motos).map((x) => x.nome)).toEqual([
      "YS 250 FAZER/ FAZER L. EDITION /BLUEFLEX",
      "FZ25 250 FAZER FLEX",
    ]);
  });

  it("um modelo de uma palavra pega todas as versões dele", () => {
    expect(candidatosDeModelo("Ka", FORD)).toHaveLength(3);
  });

  it("sem candidato, devolve tudo — lista longa é melhor que tela sem saída", () => {
    expect(candidatosDeModelo("Belina", FORD)).toHaveLength(FORD.length);
  });

  it("ignora acento: 'Sedã' acha 'Sedan'", () => {
    expect(candidatosDeModelo("Ka Sedã", [{ nome: "Ka 1.5 Sedán SE" }])).toHaveLength(1);
  });
});

describe("valor da Fipe em centavos", () => {
  it("lê o formato que a Fipe manda", () => {
    expect(valorParaCentavos("R$ 41.247,00")).toBe(4_124_700);
    expect(valorParaCentavos("R$ 52.553,00")).toBe(5_255_300);
    expect(valorParaCentavos("R$ 1.234.567,89")).toBe(123_456_789);
  });

  it("recusa o que não é valor, em vez de devolver zero", () => {
    expect(valorParaCentavos("consulte")).toBeNull();
    expect(valorParaCentavos("")).toBeNull();
  });
});

describe("ano-modelo da Fipe", () => {
  const ANOS = [
    { codigo: "2015-3", nome: "2015 Diesel" },
    { codigo: "2014-1", nome: "2014 Gasolina" },
    { codigo: "2014-3", nome: "2014 Diesel" },
  ];

  it("acha o ano do veículo", () => {
    expect(anoDaFipe(2015, ANOS)).toBe("2015-3");
  });

  it("com dois combustíveis no mesmo ano, fica com o primeiro", () => {
    expect(anoDaFipe(2014, ANOS)).toBe("2014-1");
  });

  it("sem o ano na tabela, devolve nulo — não empurra o ano errado", () => {
    expect(anoDaFipe(1998, ANOS)).toBeNull();
  });

  it("veículo sem ano cadastrado cai no primeiro da lista", () => {
    expect(anoDaFipe(null, ANOS)).toBe("2015-3");
  });
});

describe("quando a tabela virou o mês", () => {
  it("nunca consultada precisa consultar", () => {
    expect(tabelaMudou(null, "agosto de 2026")).toBe(true);
  });

  it("mesma referência não precisa", () => {
    expect(tabelaMudou("agosto de 2026", "agosto de 2026")).toBe(false);
    expect(tabelaMudou("Agosto de 2026 ", "agosto de 2026")).toBe(false);
  });

  it("mês novo precisa", () => {
    expect(tabelaMudou("agosto de 2026", "setembro de 2026")).toBe(true);
  });
});

describe("normalizar", () => {
  it("tira acento e caixa", () => {
    expect(normalizar("  Citroën ")).toBe("citroen");
    expect(normalizar("VW - VolksWagen")).toBe("vw - volkswagen");
  });
});
