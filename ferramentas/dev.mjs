/**
 * Sobe a API e o Vite juntos, num terminal só.
 *
 *   npm run dev
 *
 * A API responde em :3000 e o Vite em :5173, repassando `/api` para lá. Você
 * abre o :5173. Ctrl-C derruba os dois — sem isso, sair do Vite deixaria um
 * servidor Node segurando a porta e a próxima subida falharia sem explicar.
 */

import { spawn } from "node:child_process";

const CORES = { api: "\x1b[36m", web: "\x1b[35m", fim: "\x1b[0m" };

const processos = [
  ["api", ["run", "-w", "@alagoana/api", "dev"]],
  ["web", ["run", "-w", "@alagoana/web", "dev"]],
].map(([nome, argumentos]) => {
  const filho = spawn("npm", argumentos, { stdio: ["ignore", "pipe", "pipe"] });

  for (const fluxo of [filho.stdout, filho.stderr]) {
    fluxo.setEncoding("utf8");
    fluxo.on("data", (pedaco) => {
      for (const linha of pedaco.split("\n")) {
        if (linha.trim()) console.log(`${CORES[nome]}${nome}${CORES.fim} │ ${linha}`);
      }
    });
  }

  filho.on("exit", (codigo) => {
    console.log(`${CORES[nome]}${nome}${CORES.fim} │ saiu com código ${codigo}`);
    derrubar(codigo ?? 0);
  });

  return filho;
});

let derrubando = false;
function derrubar(codigo) {
  if (derrubando) return;
  derrubando = true;
  for (const filho of processos) filho.kill("SIGTERM");
  setTimeout(() => process.exit(codigo), 300);
}

for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => derrubar(0));
