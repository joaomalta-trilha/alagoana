/**
 * Restaura uma cópia de segurança por cima de um banco.
 *
 *   npm run restaurar -- backups/alagoana-2026-08-23-0930.dump
 *   npm run restaurar -- <arquivo> --confirmo
 *   npm run restaurar -- <arquivo> --confirmo --producao
 *
 * É a operação mais destrutiva do projeto: apaga tudo o que está no banco de
 * destino e põe o conteúdo do arquivo no lugar. Por isso três travas:
 *
 *   1. Sem `--confirmo`, só mostra o que faria.
 *   2. Contra banco que não é `localhost`, exige também `--producao`. Escrever
 *      a bandeira obriga a olhar o endereço antes.
 *   3. Mostra o que há hoje no destino e o que veio no arquivo, lado a lado,
 *      antes de perguntar. Restaurar em cima do banco errado é o engano que
 *      não tem desfazer.
 *
 * Restaure sempre num banco descartável antes de precisar de verdade. Backup
 * que nunca foi restaurado é suposição, não backup.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";

const argumentos = process.argv.slice(2);
const confirmado = argumentos.includes("--confirmo");
const producao = argumentos.includes("--producao");
const arquivo = argumentos.find((a) => !a.startsWith("--"));

const url = process.env["DATABASE_URL"];
if (!url) { console.error("\n  falta o DATABASE_URL.\n"); process.exit(1); }
if (!arquivo) {
  console.error("\n  informe o arquivo:  npm run restaurar -- backups/alagoana-....dump\n");
  process.exit(1);
}
if (!existsSync(arquivo)) { console.error(`\n  não achei ${arquivo}.\n`); process.exit(1); }

const ehLocal = /@?(localhost|127\.0\.0\.1)[:/]/.test(url);
const destino = new URL(url).host + new URL(url).pathname;

function rodar(comando, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, args, { stdio: ["ignore", "inherit", "pipe"] });
    let erro = "";
    p.stderr.on("data", (d) => { erro += d; });
    p.on("error", (e) => reject(new Error(
      e.code === "ENOENT"
        ? `${comando} não encontrado. No Mac com Postgres.app, acrescente ao PATH:\n` +
          "  /Applications/Postgres.app/Contents/Versions/latest/bin"
        : e.message)));
    // pg_restore devolve 1 com avisos que não são erro; o texto decide.
    p.on("close", (codigo) => {
      if (codigo === 0) return resolve("");
      if (/error:/i.test(erro)) return reject(new Error(erro.trim()));
      resolve(erro.trim());
    });
  });
}

async function contar() {
  const cliente = new pg.Client({ connectionString: url });
  try {
    await cliente.connect();
    const { rows } = await cliente.query(`
      select (select count(*) from veiculo) as veiculos,
             (select count(*) from custo) as custos,
             (select count(*) from movimento_caixa) as movimentos,
             (select count(*) from usuario) as usuarios`);
    return rows[0];
  } catch {
    return null;              // vazio, sem as tabelas, ou fora de alcance
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

console.log(`\n  DESTINO  ${destino}${ehLocal ? "" : "   ← NÃO é local"}`);
console.log(`  ARQUIVO  ${arquivo}`);

if (!ehLocal && !producao) {
  console.error("\n  recusado: o destino não é local. Se é isso mesmo, acrescente --producao\n");
  process.exit(1);
}

const antes = await contar();
console.log("\n  o que há no destino agora:");
console.log(antes
  ? `    ${antes.veiculos} veículos · ${antes.custos} custos · ` +
    `${antes.movimentos} movimentos · ${antes.usuarios} usuários`
  : "    vazio, ou ainda sem as tabelas");
console.log("\n  tudo isso será apagado e substituído pelo conteúdo do arquivo.");
if (!confirmado) {
  console.log("\n  nada foi feito. Para valer, acrescente --confirmo\n");
  process.exit(0);
}

console.log("\n  restaurando…");
const avisos = await rodar("pg_restore", [
  "--clean", "--if-exists", "--no-owner", "--no-privileges",
  "--dbname", url, arquivo,
]);
if (avisos) console.log(`  (avisos do pg_restore, sem erro: ${avisos.split("\n").length} linhas)`);

const depois = await contar();
console.log(`\n  agora: ${depois.veiculos} veículos · ${depois.custos} custos · ` +
            `${depois.movimentos} movimentos · ${depois.usuarios} usuários`);
console.log("\n  confira com:  npm run db:conferir\n");
