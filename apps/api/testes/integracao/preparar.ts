/**
 * Cria o banco dos testes antes da suíte e o derruba depois.
 *
 * As migrações são as mesmas de produção, aplicadas na mesma ordem: se um
 * teste passa aqui e falha lá, o culpado é o dado, não o schema.
 */

import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BANCO_TESTE, URL_ADMIN, URL_TESTE } from "./banco.js";

const MIGRACOES = join(dirname(fileURLToPath(import.meta.url)), "../../src/db/migrations");

async function comAdmin(sql: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: URL_ADMIN });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

export async function setup(): Promise<void> {
  // `with (force)` derruba conexões penduradas de uma rodada anterior que
  // morreu no meio — sem isso, um Ctrl-C deixaria a suíte travada para sempre.
  await comAdmin(`drop database if exists ${BANCO_TESTE} with (force)`);
  await comAdmin(`create database ${BANCO_TESTE}`);

  const cliente = new pg.Client({ connectionString: URL_TESTE });
  await cliente.connect();
  try {
    const arquivos = (await readdir(MIGRACOES)).filter((n) => n.endsWith(".sql")).sort();
    for (const arquivo of arquivos) {
      await cliente.query(await readFile(join(MIGRACOES, arquivo), "utf8"));
    }
  } finally {
    await cliente.end();
  }
}

export async function teardown(): Promise<void> {
  await comAdmin(`drop database if exists ${BANCO_TESTE} with (force)`);
}
