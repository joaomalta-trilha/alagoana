/** Aplica as migrações pendentes, em ordem, cada uma em sua transação. */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, comTransacao } from "./conexao.js";

const PASTA = join(dirname(fileURLToPath(import.meta.url)), "migrations");

await pool.query(`
  create table if not exists migracao (
    nome        text primary key,
    aplicada_em timestamptz not null default now()
  )`);

const arquivos = (await readdir(PASTA)).filter((n) => n.endsWith(".sql")).sort();
const { rows } = await pool.query<{ nome: string }>("select nome from migracao");
const aplicadas = new Set(rows.map((r) => r.nome));

let novas = 0;
for (const arquivo of arquivos) {
  if (aplicadas.has(arquivo)) continue;
  const sql = await readFile(join(PASTA, arquivo), "utf8");
  await comTransacao(async (c) => {
    await c.query(sql);
    await c.query("insert into migracao (nome) values ($1)", [arquivo]);
  });
  console.log(`  aplicada  ${arquivo}`);
  novas++;
}

console.log(novas ? `\n  ${novas} migração(ões) aplicada(s).` : "  nada pendente.");
await pool.end();
