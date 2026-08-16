import { defineConfig } from "vitest/config";
import { URL_TESTE } from "./testes/integracao/banco.js";

export default defineConfig({
  test: {
    // Os testes de integração nunca encostam no banco de trabalho: `preparar`
    // cria um `alagoana_teste` do zero, aplica as migrações e o derruba no fim.
    env: { DATABASE_URL: URL_TESTE },
    globalSetup: ["./testes/integracao/preparar.ts"],
    // Um banco só, compartilhado: arquivos em paralelo truncariam as tabelas
    // uns dos outros no meio do caminho.
    fileParallelism: false,
  },
});
