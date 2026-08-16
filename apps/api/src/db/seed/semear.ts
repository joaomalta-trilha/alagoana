/**
 * Carga inicial de um banco vazio.
 *
 * Grava catálogos, usuários, contas e a frota inteira em uma única transação.
 * Idempotente: se já houver veículos, recusa em vez de duplicar — para trocar
 * a frota de um banco que já está no ar, use `recarregar`.
 *
 * A frota vem de `frota.json`; a escrita mora em `carga.ts`, compartilhada
 * com `recarregar`.
 */

import type { PoolClient } from "pg";
import { pool, comTransacao } from "../conexao.js";
import { paraNumeric } from "../../dominio/dinheiro.js";
import {
  lerCarga, lerCatalogo, gravarVeiculos, gravarCapital, gravarCatalogo,
  COMISSOES_PADRAO, type Carga, type Catalogo,
} from "./carga.js";

/** Sócios da v1. Só João tem e-mail real; os outros entram inativos. */
const SOCIOS = [
  { nome: "João", email: "joaofighera@gmail.com", ativo: true },
  { nome: "Victor", email: "victor@alagoana.local", ativo: false },
  { nome: "Ricardo", email: "ricardo@alagoana.local", ativo: false },
];

async function semear(c: PoolClient, carga: Carga, catalogo: Catalogo) {
  const { rows: existentes } = await c.query<{ n: string }>("select count(*) n from veiculo");
  if (Number(existentes[0]!.n) > 0) {
    throw new Error("já existem veículos no banco — use `recarregar` para trocar a frota");
  }

  // --------------------------------------------------------- catálogos
  // Dois catálogos de marca: Honda e BMW existem nos dois e significam coisas
  // diferentes. As cores são uma lista só — cor é cor.
  await gravarCatalogo(c, catalogo.marcas, "carro");
  await gravarCatalogo(c, catalogo.marcasMoto, "moto");
  for (const cor of catalogo.cores) {
    await c.query("insert into cor (nome) values ($1) on conflict (nome) do nothing", [cor]);
  }

  // ---------------------------------------------------------- usuários
  // senha_hash fica nula: cada um define a sua com `npm run senha`.
  const idPorSocio = new Map<string, string>();
  for (const s of SOCIOS) {
    const { rows } = await c.query<{ id: string }>(
      "insert into usuario (nome, email, papel, ativo) values ($1, $2, 'master', $3) returning id",
      [s.nome, s.email, s.ativo]);
    idPorSocio.set(s.nome, rows[0]!.id);
  }

  // ------------------------------------------------------------ contas
  for (const conta of carga.contas) {
    const socioId = conta.tipo === "socio" ? idPorSocio.get(conta.nome) ?? null : null;
    if (conta.tipo === "socio" && !socioId) {
      throw new Error(`conta de sócio sem usuário correspondente: ${conta.nome}`);
    }
    await c.query(
      `insert into conta (nome, tipo, socio_id, saldo_inicial) values ($1, $2, $3, $4)`,
      [conta.nome, conta.tipo, socioId, paraNumeric(conta.saldo_inicial)]);
  }

  await gravarCapital(c, carga, idPorSocio);
  const r = await gravarVeiculos(c, carga.veiculos);

  await c.query(
    "insert into config (chave, valor) values ($1, $2), ($3, $4)",
    ["data_implantacao", JSON.stringify(carga.congelado_em),
     "comissoes_padrao", JSON.stringify(COMISSOES_PADRAO)]);

  return r;
}

const carga = await lerCarga();
const catalogo = await lerCatalogo();

const r = await comTransacao((c) => semear(c, carga, catalogo));
console.log(`  ${r.veiculos} veículos e ${r.lancamentos} lançamentos gravados.`);
console.log("  extrato de caixa vazio, como manda a §9.");
await pool.end();
