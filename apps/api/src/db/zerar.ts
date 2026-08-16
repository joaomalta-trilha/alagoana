/** Derruba o schema inteiro. Só para desenvolvimento. */
import { pool } from "./conexao.js";
import { DATABASE_URL } from "../env.js";

if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL)) {
  throw new Error("zerar só roda contra banco local");
}
await pool.query("drop schema public cascade; create schema public");
console.log("  schema zerado.");
await pool.end();
