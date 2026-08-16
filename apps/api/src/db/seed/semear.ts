/**
 * Carga inicial — seção 9 da especificação.
 *
 * Lê os JSON gerados por `ferramentas/extrair-carga.py` a partir do
 * protótipo e grava tudo em uma única transação. Idempotente: se já houver
 * veículos, recusa em vez de duplicar.
 *
 * Deliberadamente NÃO gera movimentação de caixa retroativa para os 16
 * veículos. Os saldos das contas já são a posição líquida de hoje; lançar o
 * histórico zeraria o caixa artificialmente. O extrato começa vazio.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { pool, comTransacao } from "../conexao.js";
import { paraNumeric, type Centavos } from "../../dominio/dinheiro.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

interface Catalogo {
  marcas: Record<string, string[]>;
  marcasMoto: Record<string, string[]>;
  cores: string[];
}

/**
 * Grava um catálogo de marcas e modelos.
 *
 * Idempotente porque o catálogo de motos chega pela migração 0004, e semear
 * roda depois: sem o `on conflict`, a segunda passagem quebraria em cima de
 * dado que já está certo.
 */
async function semearCatalogo(
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

interface CustoJson {
  descricao: string;
  categoria: string;
  data: string | null;
  valor: Centavos;
}

interface VeiculoJson {
  codigo: string;
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

interface Carga {
  congelado_em: string;
  contas: { nome: string; tipo: string; saldo_inicial: Centavos }[];
  capital_inicial: { socio: string; valor: Centavos }[];
  veiculos: VeiculoJson[];
}

/** Sócios da v1. Só João tem e-mail real; os outros entram inativos. */
const SOCIOS = [
  { nome: "João", email: "joaofighera@gmail.com", ativo: true },
  { nome: "Victor", email: "victor@alagoana.local", ativo: false },
  { nome: "Ricardo", email: "ricardo@alagoana.local", ativo: false },
];

const COMISSOES_PADRAO = [
  { beneficiario: "Comissão Alagoana", valor: 100_000 },
  { beneficiario: "Comissão Victor", valor: 50_000 },
];

const num = (c: Centavos | null) => (c === null ? null : paraNumeric(c));

async function semear(c: PoolClient, carga: Carga, catalogo: Catalogo) {
  const { rows: existentes } = await c.query<{ n: string }>("select count(*) n from veiculo");
  if (Number(existentes[0]!.n) > 0) {
    throw new Error("já existem veículos no banco — rode `zerar` e `migrar` antes de semear");
  }

  // --------------------------------------------------------- catálogos
  // Dois catálogos de marca: Honda e BMW existem nos dois e significam coisas
  // diferentes. As cores são uma lista só — cor é cor.
  await semearCatalogo(c, catalogo.marcas, "carro");
  await semearCatalogo(c, catalogo.marcasMoto, "moto");
  for (const cor of catalogo.cores) {
    await c.query("insert into cor (nome) values ($1) on conflict (nome) do nothing", [cor]);
  }

  // ---------------------------------------------------------- usuários
  // senha_hash fica nula: cada um define a sua pelo link de ativação.
  const idPorSocio = new Map<string, string>();
  for (const s of SOCIOS) {
    const { rows } = await c.query<{ id: string }>(
      "insert into usuario (nome, email, papel, ativo) values ($1, $2, 'master', $3) returning id",
      [s.nome, s.email, s.ativo]);
    idPorSocio.set(s.nome, rows[0]!.id);
  }

  // ------------------------------------------------------------ contas
  const idPorConta = new Map<string, string>();
  for (const conta of carga.contas) {
    const socioId = conta.tipo === "socio" ? idPorSocio.get(conta.nome) ?? null : null;
    if (conta.tipo === "socio" && !socioId) {
      throw new Error(`conta de sócio sem usuário correspondente: ${conta.nome}`);
    }
    const { rows } = await c.query<{ id: string }>(
      `insert into conta (nome, tipo, socio_id, saldo_inicial)
       values ($1, $2, $3, $4) returning id`,
      [conta.nome, conta.tipo, socioId, paraNumeric(conta.saldo_inicial)]);
    idPorConta.set(conta.nome, rows[0]!.id);
  }

  // ------------------------------------------- capital de implantação
  // Sem movimento_id: o extrato começa vazio (§9) e estes aportes são
  // posição de partida, não movimentação.
  for (const { socio, valor } of carga.capital_inicial) {
    await c.query(
      `insert into aporte_socio (socio_id, data, tipo, valor, observacao)
       values ($1, $2, 'aporte', $3, 'Capital na implantação')`,
      [idPorSocio.get(socio), carga.congelado_em, paraNumeric(valor)]);
  }

  // ---------------------------------------------------------- veículos
  let lancamentos = 0;
  for (const v of carga.veiculos) {
    const { rows } = await c.query<{ id: string }>(
      `insert into veiculo (codigo, marca, modelo, versao, ano, cor, placa, km,
                            data_compra, valor_compra, valor_anuncio,
                            fipe_compra, fipe_hoje, data_venda, valor_venda,
                            origem, observacao)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [v.codigo, v.marca, v.modelo, v.versao, v.ano, v.cor, v.placa, v.km,
       v.data_compra, paraNumeric(v.valor_compra), num(v.valor_anuncio),
       num(v.fipe_compra), num(v.fipe_hoje), v.data_venda, num(v.valor_venda),
       v.origem, v.observacao]);

    for (const custo of v.custos) {
      await c.query(
        `insert into custo (veiculo_id, descricao, categoria, data, valor)
         values ($1,$2,$3,$4,$5)`,
        [rows[0]!.id, custo.descricao, custo.categoria, custo.data, paraNumeric(custo.valor)]);
      lancamentos++;
    }
  }

  // ------------------------------------------------------- configuração
  await c.query(
    "insert into config (chave, valor) values ($1, $2), ($3, $4)",
    ["data_implantacao", JSON.stringify(carga.congelado_em),
     "comissoes_padrao", JSON.stringify(COMISSOES_PADRAO)]);

  return { veiculos: carga.veiculos.length, lancamentos };
}

const carga: Carga = JSON.parse(await readFile(join(AQUI, "frota.json"), "utf8"));
const catalogo: Catalogo = JSON.parse(await readFile(join(AQUI, "catalogo.json"), "utf8"));

const r = await comTransacao((c) => semear(c, carga, catalogo));
console.log(`  ${r.veiculos} veículos e ${r.lancamentos} lançamentos gravados.`);
console.log("  extrato de caixa vazio, como manda a §9.");
await pool.end();
