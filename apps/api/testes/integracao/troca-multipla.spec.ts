/**
 * Mais de um veículo na troca — pedido pela loja em 17/08/2026.
 *
 * O que muda com N: o caixa recebe a venda menos a SOMA das avaliações, cada
 * recebido vira um veículo independente com o seu vínculo, e cada um tem o
 * seu próprio ágio. O que não muda: com um veículo só, os números da §4.5
 * continuam idênticos — é o que o caso do Tracker cobra.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, comTransacao, comLeitura } from "../../src/db/conexao.js";
import {
  criarVeiculo, venderVeiculo, previaExclusao, desfazerVenda,
} from "../../src/servicos/veiculos.js";
import { ficha } from "../../src/servicos/consultas.js";
import { calcularTroca, calcularTrocas } from "../../src/dominio/veiculo.js";
import { base, limpar, saldo, type Base } from "./fixtura.js";

const HOJE = "2026-08-17";
let b: Base;

const CARRO = {
  marca: "Fiat", modelo: "Argo", cor: "Branco", placa: "ARG2B34",
  avaliacao: 4_400_000, modo: "avaliacao" as const,
};
const MOTO = {
  tipo: "moto" as const, marca: "Yamaha", modelo: "Fazer 250", cor: "Azul",
  placa: "MOT9Z99", avaliacao: 1_600_000, modo: "avaliacao" as const,
};

async function tracker() {
  return comTransacao((c) => criarVeiculo(c, {
    marca: "Chevrolet", modelo: "Tracker", cor: "Branco", placa: "TRK1A11",
    dataCompra: "2026-06-01", valorCompra: 6_700_000, contaId: null,
  }, b.usuarioId));
}

beforeEach(async () => {
  await limpar();
  b = await base(10_000_000, 0);
});

afterAll(async () => { await pool.end(); });

describe("o cálculo com N veículos (§4.5)", () => {
  it("com um só, devolve exatamente o que a §4.5 sempre devolveu", () => {
    const um = calcularTroca(8_900_000, 4_400_000, 4_000_000, "mercado");
    const n = calcularTrocas(8_900_000, [
      { avaliacao: 4_400_000, mercado: 4_000_000, modo: "mercado" },
    ]);
    expect(n.entradas[0]).toEqual(um);
    expect(n.entradaEmCaixa).toBe(um.entradaEmCaixa);
    expect(n.custoAgioNoVendido).toBe(um.custoAgioNoVendido);
  });

  it("o caixa recebe a venda menos a soma das avaliações", () => {
    const r = calcularTrocas(8_900_000, [
      { avaliacao: 4_400_000, modo: "avaliacao" },
      { avaliacao: 1_600_000, modo: "avaliacao" },
    ]);
    expect(r.avaliacaoTotal).toBe(6_000_000);
    expect(r.entradaEmCaixa).toBe(2_900_000);
  });

  it("cada veículo tem o seu ágio, e o custo no vendido é a soma", () => {
    const r = calcularTrocas(8_900_000, [
      { avaliacao: 4_400_000, mercado: 4_000_000, modo: "mercado" },   // ágio 4.000
      { avaliacao: 1_600_000, mercado: 1_500_000, modo: "mercado" },   // ágio 1.000
      { avaliacao: 1_000_000, modo: "avaliacao" },                     // sem ágio
    ]);
    expect(r.entradas.map((e) => e.agio)).toEqual([400_000, 100_000, 0]);
    expect(r.agioTotal).toBe(500_000);
    expect(r.custoAgioNoVendido).toBe(500_000);
    expect(r.entradaEmCaixa).toBe(8_900_000 - 7_000_000);
  });

  it("sem troca nenhuma, o caixa recebe a venda inteira", () => {
    const r = calcularTrocas(8_900_000, []);
    expect(r.entradaEmCaixa).toBe(8_900_000);
    expect(r.entradas).toEqual([]);
  });
});

describe("venda recebendo dois veículos", () => {
  it("cria os dois no estoque, cada um com o seu vínculo", async () => {
    const v = await tracker();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: b.alagoana,
      lancarComissoes: false, trocas: [CARRO, MOTO],
    }, b.usuarioId));

    expect(r.veiculosQueEntraram.map((x) => x.codigo)).toEqual(["V-02", "V-03"]);

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    expect(f.troca.entraram.map((x) => x.descricao))
      .toEqual(["Fiat Argo", "Yamaha Fazer 250"]);
    expect(f.troca.entraram.map((x) => x.avaliacao)).toEqual([4_400_000, 1_600_000]);

    // Cada um aponta de volta para a mesma venda.
    for (const entrou of r.veiculosQueEntraram) {
      const e = await comLeitura((c) => ficha(c, entrou.id, HOJE));
      expect(e.origem).toBe("troca");
      expect(e.troca.saiu?.codigo).toBe("V-01");
    }
  });

  it("o caixa recebe a venda menos as duas avaliações", async () => {
    const antes = await saldo(b.alagoana);
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: b.alagoana,
      lancarComissoes: false, trocas: [CARRO, MOTO],
    }, b.usuarioId));

    expect(await saldo(b.alagoana)).toBe(antes + 2_900_000);
  });

  it("o tipo de cada recebido é respeitado — moto entra como moto", async () => {
    const v = await tracker();
    const r = await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: null,
      lancarComissoes: false, trocas: [CARRO, MOTO],
    }, b.usuarioId));

    const carro = await comLeitura((c) => ficha(c, r.veiculosQueEntraram[0]!.id, HOJE));
    const moto = await comLeitura((c) => ficha(c, r.veiculosQueEntraram[1]!.id, HOJE));
    expect(carro.tipo).toBe("carro");
    expect(moto.tipo).toBe("moto");
    expect(moto.etiqueta).toBe("moto");
  });

  it("pelo mercado, cada ágio vira uma linha de custo com o código de origem", async () => {
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: null, lancarComissoes: false,
      trocas: [
        { ...CARRO, mercado: 4_000_000, modo: "mercado" },
        { ...MOTO, mercado: 1_500_000, modo: "mercado" },
      ],
    }, b.usuarioId));

    const f = await comLeitura((c) => ficha(c, v.id, HOJE));
    // Ordenado pela descrição: os dois nascem na mesma transação e o
    // `criado_em` deles é idêntico, então a ordem da lista não é o assunto
    // deste caso — o assunto é cada ágio virar a sua linha, com o código.
    const agios = f.custos
      .filter((k) => k.categoria === "Troca")
      .sort((x, y) => x.descricao.localeCompare(y.descricao));
    expect(agios.map((k) => [k.descricao, k.valor])).toEqual([
      ["Ágio na troca do V-02 · Fiat Argo", 400_000],
      ["Ágio na troca do V-03 · Yamaha Fazer 250", 100_000],
    ]);
    // Os dois ágios entram no custo do carro vendido.
    expect(f.custoPreparacao).toBe(500_000);
  });

  it("a prévia de exclusão lista os dois vínculos", async () => {
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: null,
      lancarComissoes: false, trocas: [CARRO, MOTO],
    }, b.usuarioId));

    const previa = await comLeitura((c) => previaExclusao(c, v.id));
    expect(previa.trocas).toEqual([
      { id: expect.any(String), codigo: "V-02", descricao: "Fiat Argo", sentido: "entrou" },
      { id: expect.any(String), codigo: "V-03", descricao: "Yamaha Fazer 250", sentido: "entrou" },
    ]);
  });

  it("desfazer a venda recusa nomeando os dois carros", async () => {
    const v = await tracker();
    await comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: null,
      lancarComissoes: false, trocas: [CARRO, MOTO],
    }, b.usuarioId));

    await expect(comTransacao((c) => desfazerVenda(c, v.id, b.usuarioId)))
      .rejects.toThrow(/entraram 2 veículos na troca: V-02 · Fiat Argo, V-03 · Yamaha Fazer 250/);
  });

  it("recusa avaliação zero em qualquer um dos recebidos", async () => {
    const v = await tracker();
    await expect(comTransacao((c) => venderVeiculo(c, v.id, {
      dataVenda: "2026-08-10", valorVenda: 8_900_000, contaId: null,
      trocas: [CARRO, { ...MOTO, avaliacao: 0 }],
    }, b.usuarioId))).rejects.toThrow(/avaliação de cada veículo/);

    // Recusou antes de gravar qualquer um dos dois.
    const { rows } = await pool.query<{ n: string }>("select count(*) n from veiculo");
    expect(rows[0]!.n).toBe("1");
  });
});
