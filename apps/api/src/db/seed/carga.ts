/**
 * A frota e o que ela grava — parte comum de `semear` e `recarregar`.
 *
 * `semear` monta um banco do zero; `recarregar` troca a frota de um banco que
 * já está no ar, preservando usuários, senhas e sessões. As duas escrevem
 * exatamente as mesmas linhas, então a escrita mora aqui e não em duplicata.
 *
 * A fonte é `frota.json`, gerado por `ferramentas/extrair-planilha.py` a
 * partir de `referencia/planilha-2026.xlsx` — a planilha que a loja mantém.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { paraNumeric, type Centavos } from "../../dominio/dinheiro.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

export interface Catalogo {
  marcas: Record<string, string[]>;
  marcasMoto: Record<string, string[]>;
  cores: string[];
}

export interface CustoJson {
  descricao: string;
  categoria: string;
  data: string | null;
  valor: Centavos;
}

export interface VeiculoJson {
  codigo: string;
  tipo: "carro" | "moto" | "outro";
  marca: string;
  modelo: string;
  versao: string | null;
  ano: number | null;
  cor: string;
  placa: string;
  km: number | null;
  data_compra: string;
  valor_compra: Centavos;
  valor_anuncio: Centavos | null;
  fipe_compra: Centavos | null;
  fipe_hoje: Centavos | null;
  data_venda: string | null;
  valor_venda: Centavos | null;
  origem: string;
  observacao: string | null;
  custos: CustoJson[];
}

export interface Carga {
  congelado_em: string;
  contas: { nome: string; tipo: string; saldo_inicial: Centavos }[];
  capital_inicial: { socio: string; valor: Centavos }[];
  veiculos: VeiculoJson[];
}

/** Comissões que a §4.6 sugere por padrão; a loja edita depois. */
export const COMISSOES_PADRAO = [
  { beneficiario: "Comissão Alagoana", valor: 100_000 },
  { beneficiario: "Comissão Victor", valor: 50_000 },
];

const num = (c: Centavos | null) => (c === null ? null : paraNumeric(c));

/**
 * Grava um catálogo de marcas e modelos.
 *
 * Idempotente porque o catálogo de motos chega pela migração 0004, e a carga
 * roda depois: sem o `on conflict`, a segunda passagem quebraria em cima de
 * dado que já está certo.
 */
export async function gravarCatalogo(
  c: PoolClient, marcas: Record<string, string[]>, tipo: "carro" | "moto",
): Promise<void> {
  for (const [marca, modelos] of Object.entries(marcas)) {
    const { rows } = await c.query<{ id: string }>(
      `insert into marca (nome, tipo) values ($1, $2)
       on conflict (nome, tipo) do update set nome = excluded.nome
       returning id`, [marca, tipo]);
    for (const modelo of modelos) {
      await c.query(
        `insert into modelo (marca_id, nome) values ($1, $2)
         on conflict (marca_id, nome) do nothing`, [rows[0]!.id, modelo]);
    }
  }
}

export async function lerCarga(): Promise<Carga> {
  return JSON.parse(await readFile(join(AQUI, "frota.json"), "utf8"));
}

export async function lerCatalogo(): Promise<Catalogo> {
  return JSON.parse(await readFile(join(AQUI, "catalogo.json"), "utf8"));
}

/**
 * Grava os veículos e os lançamentos de custo.
 *
 * Não gera movimentação de caixa retroativa: os saldos das contas já são a
 * posição líquida de hoje, e lançar o histórico zeraria o caixa duas vezes.
 * O extrato começa vazio, como manda a §9.
 */
export async function gravarVeiculos(
  c: PoolClient, veiculos: VeiculoJson[],
): Promise<{ veiculos: number; lancamentos: number }> {
  let lancamentos = 0;
  for (const v of veiculos) {
    const { rows } = await c.query<{ id: string }>(
      `insert into veiculo (codigo, tipo, marca, modelo, versao, ano, cor, placa, km,
                            data_compra, valor_compra, valor_anuncio,
                            fipe_compra, fipe_hoje, data_venda, valor_venda,
                            origem, observacao)
       values ($1,$18,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [v.codigo, v.marca, v.modelo, v.versao, v.ano, v.cor, v.placa, v.km,
       v.data_compra, paraNumeric(v.valor_compra), num(v.valor_anuncio),
       num(v.fipe_compra), num(v.fipe_hoje), v.data_venda, num(v.valor_venda),
       v.origem, v.observacao, v.tipo]);

    for (const custo of v.custos) {
      await c.query(
        `insert into custo (veiculo_id, descricao, categoria, data, valor)
         values ($1,$2,$3,$4,$5)`,
        [rows[0]!.id, custo.descricao, custo.categoria, custo.data, paraNumeric(custo.valor)]);
      lancamentos++;
    }
  }
  return { veiculos: veiculos.length, lancamentos };
}

/**
 * Grava o capital de implantação.
 *
 * Sem `movimento_id`: são posição de partida, não movimentação de caixa.
 */
export async function gravarCapital(
  c: PoolClient, carga: Carga, idPorSocio: Map<string, string>,
): Promise<void> {
  for (const { socio, valor } of carga.capital_inicial) {
    const id = idPorSocio.get(socio);
    if (!id) throw new Error(`capital de sócio sem usuário correspondente: ${socio}`);
    await c.query(
      `insert into aporte_socio (socio_id, data, tipo, valor, observacao)
       values ($1, $2, 'aporte', $3, 'Capital na implantação')`,
      [id, carga.congelado_em, paraNumeric(valor)]);
  }
}
