import pg from "pg";
import { DATABASE_URL } from "../env.js";

// numeric (OID 1700) chega como string e assim permanece: quem converte para
// centavos é o domínio, nunca o driver. Isto é uma trava, não um detalhe —
// deixar o pg fazer parseFloat aqui reintroduziria float no dinheiro.
pg.types.setTypeParser(1700, (v) => v);
// date (OID 1082) chega como 'AAAA-MM-DD' e assim permanece, sem virar Date
// e sem passar por fuso nenhum.
pg.types.setTypeParser(1082, (v) => v);

/**
 * TLS conforme o `sslmode` da própria URL, como o `psql` faz.
 *
 * Banco gerenciado exige TLS quando acessado de fora, e no `localhost` ele não
 * existe. Em vez de adivinhar pelo endereço, obedece ao que está escrito na
 * URL — assim a mesma variável de ambiente descreve o banco por inteiro, e
 * mudar de provedor não vira mudança de código.
 *
 *   ?sslmode=require     exige TLS e confere o certificado
 *   ?sslmode=no-verify   exige TLS e aceita certificado próprio do provedor
 *   ausente ou disable   sem TLS (desenvolvimento)
 */
function tls(url: string): pg.PoolConfig["ssl"] {
  const modo = new URL(url).searchParams.get("sslmode");
  if (!modo || modo === "disable") return undefined;
  return { rejectUnauthorized: modo !== "no-verify" };
}

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: tls(DATABASE_URL),
  // Postgres gerenciado costuma cortar conexão ociosa; o pool percebe antes de
  // entregar uma conexão morta para uma transação de venda.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/** Empresta um cliente do pool para leitura, sem abrir transação. */
export async function comLeitura<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    return await fn(cliente);
  } finally {
    cliente.release();
  }
}

export async function comTransacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const resultado = await fn(cliente);
    await cliente.query("commit");
    return resultado;
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}
