import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import { criarVeiculo, editarVeiculo, venderVeiculo } from "../../src/servicos/veiculos.js";
import { ficha, listarVeiculos } from "../../src/servicos/consultas.js";
import { listarCatalogos } from "../../src/servicos/catalogos.js";
import { base, limpar, type Base } from "./fixtura.js";

const HOJE = "2026-08-09";
let b: Base;

beforeEach(async () => {
  await limpar();
  b = await base(50_000_000);
});

afterAll(async () => { await pool.end(); });

/**
 * `limpar` trunca marca e modelo, então o catálogo de motos que a migração
 * plantou não sobrevive entre os casos. Cada teste que precisa dele o refaz —
 * é o preço de ter testes que não dependem da ordem em que rodam.
 */
async function catalogoDeMotos() {
  await pool.query(`
    with m as (insert into marca (nome, tipo) values ('Honda','moto'), ('Yamaha','moto')
               returning id, nome)
    insert into modelo (marca_id, nome)
    select m.id, x.modelo from m
    join (values ('Honda','CG 160'), ('Honda','Africa Twin'), ('Yamaha','Factor 150')
         ) as x(marca, modelo) on x.marca = m.nome`);
  await pool.query(`
    with m as (insert into marca (nome, tipo) values ('Honda','carro') returning id, nome)
    insert into modelo (marca_id, nome) select m.id, 'City' from m`);
}

describe("o veículo tem tipo", () => {
  it("sem informar, é carro — a carga inicial inteira é carro", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Fiat", modelo: "Mobi", cor: "Branco", placa: "AAA1A11",
      dataCompra: "2026-06-01", valorCompra: 3_000_000, provisionarComissao: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.tipo).toBe("carro");
    expect(f.etiqueta).toBeNull();          // carro não ganha etiqueta
  });

  it("moto entra como moto e ganha etiqueta na listagem", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      tipo: "moto", marca: "Honda", modelo: "CG 160", cor: "Vermelho",
      placa: "MOT1A11", dataCompra: "2026-07-01", valorCompra: 1_200_000, provisionarComissao: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.tipo).toBe("moto");
    expect(f.etiqueta).toBe("moto");

    const lista = await comLeitura((c) => listarVeiculos(c, "estoque", HOJE));
    expect(lista.find((x) => x.id === v.id)?.etiqueta).toBe("moto");
  });

  it("tipo inventado é recusado", async () => {
    await expect(comTransacao((c) => criarVeiculo(c, {
      tipo: "caminhao" as never, marca: "Volvo", modelo: "FH", cor: "Branco",
      placa: "CAM1A11", dataCompra: "2026-07-01", valorCompra: 30_000_000, provisionarComissao: false,
    }, b.usuarioId))).rejects.toThrow(/inválido/);
  });

  it("editar troca o tipo", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      marca: "Honda", modelo: "CG 160", cor: "Vermelho", placa: "MOT1A11",
      dataCompra: "2026-07-01", valorCompra: 1_200_000, provisionarComissao: false,
    }, b.usuarioId));
    await comTransacao((c) => editarVeiculo(c, v.id, { tipo: "moto" }, b.usuarioId));

    expect((await comLeitura((c) => ficha(c, v.id, HOJE))).tipo).toBe("moto");
  });
});

describe("dois catálogos que não se misturam", () => {
  it("a Honda de carro e a Honda de moto são marcas diferentes", async () => {
    await catalogoDeMotos();

    const catalogos = await comLeitura(listarCatalogos);
    const hondaCarro = catalogos.marcas.carro.find((m) => m.nome === "Honda");
    const hondaMoto = catalogos.marcas.moto.find((m) => m.nome === "Honda");

    expect(hondaCarro?.modelos).toEqual(["City"]);
    expect(hondaMoto?.modelos).toEqual(["Africa Twin", "CG 160"]);
    // A Honda de carro não vende CG 160 — é o motivo de a unicidade ser
    // (nome, tipo) e não só (nome).
    expect(hondaCarro?.modelos).not.toContain("CG 160");
  });

  it("gravar moto com marca nova ensina o catálogo de moto, não o de carro", async () => {
    await comTransacao((c) => criarVeiculo(c, {
      tipo: "moto", marca: "Haojue", modelo: "DK 150", cor: "Preto",
      placa: "HAO1A11", dataCompra: "2026-07-01", valorCompra: 900_000, provisionarComissao: false,
    }, b.usuarioId));

    const catalogos = await comLeitura(listarCatalogos);
    expect(catalogos.marcas.moto.map((m) => m.nome)).toContain("Haojue");
    expect(catalogos.marcas.carro.map((m) => m.nome)).not.toContain("Haojue");
  });
});

describe("`outro` não tem catálogo", () => {
  it("reboque entra sem sujar a lista de marcas", async () => {
    const v = await comTransacao((c) => criarVeiculo(c, {
      tipo: "outro", marca: "Randon", modelo: "Reboque 2 eixos", cor: "Cinza",
      placa: "REB1A11", dataCompra: "2026-07-01", valorCompra: 1_500_000, provisionarComissao: false,
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.tipo).toBe("outro");
    expect(f.marca).toBe("Randon");           // o veículo guarda o texto

    const catalogos = await comLeitura(listarCatalogos);
    for (const tipo of ["carro", "moto"] as const) {
      expect(catalogos.marcas[tipo].map((m) => m.nome)).not.toContain("Randon");
    }
    // A cor, sim, entra: cor é cor, independente do que ela pinta.
    expect(catalogos.cores).toContain("Cinza");
  });
});

describe("moto na troca de um carro — o caso principal", () => {
  it("entra como moto, com o vínculo e o ágio de sempre", async () => {
    const carro = await comTransacao((c) => criarVeiculo(c, {
      marca: "Chevrolet", modelo: "Tracker", cor: "Preto", placa: "TRK1A23",
      dataCompra: "2026-04-01", valorCompra: 6_700_000, provisionarComissao: false,
    }, b.usuarioId));

    const r = await comTransacao((c) => venderVeiculo(c, carro.id, {
      dataVenda: "2026-08-03", valorVenda: 8_900_000, lancarComissoes: false,
      contaId: b.alagoana,
      trocas: [{
        tipo: "moto", marca: "Yamaha", modelo: "Factor 150", cor: "Azul",
        placa: "MOT9Z99", avaliacao: 1_400_000, mercado: 1_200_000, modo: "mercado", provisionarComissao: false,
      }],
    }, b.usuarioId));

    const moto = await comLeitura((c) => ficha(c, r.veiculosQueEntraram[0]!.id, HOJE));
    expect(moto.tipo).toBe("moto");
    expect(moto.origem).toBe("troca");
    expect(moto.valorCompra).toBe(1_200_000);        // entrou pelo mercado
    expect(moto.troca.saiu?.codigo).toBe("V-01");

    // O ágio continua virando custo do carro vendido, como no modo mercado.
    expect(r.agio).toBe(200_000);
    const vendido = await comLeitura((c) => ficha(c, carro.id, HOJE));
    expect(vendido.custos.find((k) => k.categoria === "Troca")?.valor).toBe(200_000);
    expect(r.entradaEmCaixa).toBe(8_900_000 - 1_400_000);
  });
});
