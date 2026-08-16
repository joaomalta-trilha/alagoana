/**
 * Troca a frota de um banco que já está no ar.
 *
 * A loja mantém a planilha; quando ela muda de verdade — como em 16/08/2026,
 * quando chegou a versão com 20 veículos —, este comando substitui veículos,
 * custos, saldos das contas e capital de implantação pela nova carga.
 *
 * O que ele **não** toca: usuários, senhas, sessões e catálogos. Ninguém é
 * deslogado, ninguém precisa redefinir senha.
 *
 * Duas travas, porque isto apaga dado:
 *
 *   1. Recusa se houver movimentação de caixa ou aporte lançado pela loja.
 *      A partir do momento em que alguém usou o caixa, a planilha deixou de
 *      ser a fonte da verdade e recarregar destruiria trabalho real. Não há
 *      opção para forçar: esse caso pede conversa, não bandeira.
 *   2. Sem `--confirmo` só mostra o que faria, e sai.
 */

import type { PoolClient } from "pg";
import { pool, comTransacao } from "../conexao.js";
import { paraNumeric, reais, deNumeric } from "../../dominio/dinheiro.js";
import {
  lerCarga, lerCatalogo, gravarVeiculos, gravarCapital, gravarCatalogo,
  COMISSOES_PADRAO, type Carga, type Catalogo,
} from "./carga.js";

const CONFIRMADO = process.argv.includes("--confirmo");

interface Retrato {
  veiculos: number;
  custos: number;
  movimentos: number;
  aportesDaLoja: number;
  contas: { nome: string; saldo_inicial: string }[];
}

async function retratar(c: PoolClient): Promise<Retrato> {
  const uma = async (sql: string) =>
    Number((await c.query<{ n: string }>(sql)).rows[0]!.n);

  const { rows: contas } = await c.query<{ nome: string; saldo_inicial: string }>(
    "select nome, saldo_inicial from conta order by nome");

  return {
    veiculos: await uma("select count(*) n from veiculo"),
    custos: await uma("select count(*) n from custo"),
    movimentos: await uma("select count(*) n from movimento_caixa"),
    // O capital de implantação é nosso; qualquer outro aporte é da loja.
    aportesDaLoja: await uma(
      `select count(*) n from aporte_socio
        where observacao is distinct from 'Capital na implantação'`),
    contas,
  };
}

async function recarregar(c: PoolClient, carga: Carga, catalogo: Catalogo) {
  const antes = await retratar(c);

  console.log("\n  NO BANCO AGORA\n");
  console.log(`  veículos                   ${String(antes.veiculos).padStart(6)}`);
  console.log(`  lançamentos de custo       ${String(antes.custos).padStart(6)}`);
  console.log(`  movimentos de caixa        ${String(antes.movimentos).padStart(6)}`);
  console.log(`  aportes lançados pela loja ${String(antes.aportesDaLoja).padStart(6)}`);
  for (const conta of antes.contas) {
    const novo = carga.contas.find((x) => x.nome === conta.nome);
    const de = reais(deNumeric(conta.saldo_inicial)!);
    const para = novo ? reais(novo.saldo_inicial) : "—";
    const marca = novo && paraNumeric(novo.saldo_inicial) !== conta.saldo_inicial ? "  muda" : "";
    console.log(`  saldo inicial · ${conta.nome.padEnd(10)}${de.padStart(14)} → ${para.padStart(14)}${marca}`);
  }

  if (antes.movimentos > 0 || antes.aportesDaLoja > 0) {
    throw new Error(
      "a loja já usou o caixa deste banco — recarregar apagaria lançamento de verdade.\n" +
      "  Não recarregue: leve as mudanças da planilha para o sistema pela tela.");
  }

  console.log("\n  VAI GRAVAR\n");
  console.log(`  veículos                   ${String(carga.veiculos.length).padStart(6)}`);
  console.log(`  lançamentos de custo       ` +
    String(carga.veiculos.reduce((a, v) => a + v.custos.length, 0)).padStart(6));

  if (!CONFIRMADO) {
    console.log("\n  nada foi gravado. Para valer:  npm run db:recarregar -- --confirmo\n");
    return null;
  }

  // ------------------------------------------------------------ apaga
  // `custo` cai junto por cascata, mas apagar explícito deixa o contrato à
  // vista: some a frota e o capital de implantação, mais nada.
  await c.query("delete from custo");
  await c.query("delete from veiculo");
  await c.query("delete from aporte_socio where observacao = 'Capital na implantação'");
  await c.query("delete from config where chave in ('data_implantacao', 'comissoes_padrao')");

  // ---------------------------------------------------------- catálogos
  // Idempotentes. Rodam porque a planilha pode trazer marca nova.
  await gravarCatalogo(c, catalogo.marcas, "carro");
  await gravarCatalogo(c, catalogo.marcasMoto, "moto");
  for (const cor of catalogo.cores) {
    await c.query("insert into cor (nome) values ($1) on conflict (nome) do nothing", [cor]);
  }

  // ------------------------------------------------------------ contas
  // Atualiza pelo nome e preserva o id: as contas antigas continuam sendo as
  // mesmas linhas, então nada que aponte para elas quebra.
  const idPorSocio = new Map<string, string>();
  const { rows: socios } = await c.query<{ id: string; nome: string }>(
    "select id, nome from usuario");
  for (const s of socios) idPorSocio.set(s.nome, s.id);

  for (const conta of carga.contas) {
    const socioId = conta.tipo === "socio" ? idPorSocio.get(conta.nome) ?? null : null;
    const { rowCount } = await c.query(
      "update conta set saldo_inicial = $2 where nome = $1",
      [conta.nome, paraNumeric(conta.saldo_inicial)]);
    if (rowCount === 0) {
      await c.query(
        "insert into conta (nome, tipo, socio_id, saldo_inicial) values ($1,$2,$3,$4)",
        [conta.nome, conta.tipo, socioId, paraNumeric(conta.saldo_inicial)]);
    }
  }

  // ------------------------------------------------------------- carga
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
const r = await comTransacao((c) => recarregar(c, carga, catalogo));

if (r) {
  console.log(`\n  ${r.veiculos} veículos e ${r.lancamentos} lançamentos gravados.`);
  console.log("  usuários, senhas e sessões intactos.");
  console.log("  confira com:  npm run db:conferir\n");
}
await pool.end();
