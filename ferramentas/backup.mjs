/**
 * Cópia de segurança do banco.
 *
 *   npm run backup                          usa o DATABASE_URL do ambiente
 *   DATABASE_URL="…" npm run backup         a produção
 *
 * Grava um `.dump` no formato próprio do Postgres — comprimido e restaurável
 * tabela a tabela — em `backups/`, que o git ignora. Um dump desta loja tem
 * todo o financeiro e os hashes de senha: é o arquivo mais sensível do
 * projeto, e commitá-lo seria publicá-lo.
 *
 * Por que existe, se o Render já faz backup do plano pago: o backup do Render
 * protege contra o disco morrer. Não protege contra a conta ser encerrada,
 * contra alguém apagar o banco, nem contra um `--confirmo` no comando errado.
 * Esta cópia sai de lá e fica com a loja.
 *
 * Confere o que copiou contando as linhas das tabelas que importam. Um dump
 * de banco vazio tem o mesmo tamanho de um dump quase vazio, e ninguém abre
 * um `.dump` para olhar.
 */

import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "backups");

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("\n  falta o DATABASE_URL.\n");
  process.exit(1);
}

/** Roda um binário do Postgres e devolve o que ele escreveu no erro padrão. */
function rodar(comando, argumentos) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, argumentos, { stdio: ["ignore", "inherit", "pipe"] });
    let erro = "";
    p.stderr.on("data", (d) => { erro += d; });
    p.on("error", (e) => reject(new Error(
      e.code === "ENOENT"
        ? `${comando} não encontrado. No Mac com Postgres.app, acrescente ao PATH:\n` +
          "  /Applications/Postgres.app/Contents/Versions/latest/bin"
        : e.message)));
    p.on("close", (codigo) => codigo === 0 ? resolve() : reject(new Error(erro.trim() || `saiu com ${codigo}`)));
  });
}

// O carimbo entra no nome: um backup por dia sobrescrevendo o anterior é um
// backup só, e o estrago costuma ser notado dias depois.
const agora = new Date();
const carimbo = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Maceio", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
}).format(agora).replace(" ", "-").replace(":", "");

mkdirSync(DESTINO, { recursive: true });
const arquivo = join(DESTINO, `alagoana-${carimbo}.dump`);

console.log(`\n  copiando para ${arquivo.replace(RAIZ + "/", "")}…`);
await rodar("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", arquivo, url]);

// Confere contando o que ficou no banco de origem. Se der zero veículo, o
// dump está tecnicamente correto e praticamente inútil.
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
const { rows } = await cliente.query(`
  select (select count(*) from veiculo)        as veiculos,
         (select count(*) from custo)          as custos,
         (select count(*) from movimento_caixa) as movimentos,
         (select count(*) from usuario)        as usuarios,
         (select count(*) from conta)          as contas`);
await cliente.end();

const c = rows[0];
const tamanho = (statSync(arquivo).size / 1024).toFixed(1);

console.log(`\n  ${tamanho} KB · ${c.veiculos} veículos · ${c.custos} custos · ` +
            `${c.movimentos} movimentos · ${c.usuarios} usuários · ${c.contas} contas`);

if (Number(c.veiculos) === 0) {
  console.error("\n  ATENÇÃO: o banco não tem veículo nenhum. Confira se o DATABASE_URL é o certo.\n");
  process.exit(1);
}

console.log("\n  guarde este arquivo fora do computador — Drive, iCloud, o que for.");
console.log("  para restaurar:  npm run restaurar -- " +
            arquivo.replace(RAIZ + "/", "") + "\n");
