/**
 * Define ou troca a senha de um usuário.
 *
 *   npm run senha -- joao@exemplo.com
 *   npm run senha -- victor@alagoana.local --ativar
 *
 * O seed cria os sócios com `senha_hash` nula de propósito: senha padrão em
 * repositório é senha vazada. Este é o caminho para o primeiro acesso, e a
 * senha entra pelo terminal sem aparecer e sem passar pelo histórico do shell.
 *
 * A digitação mostra `•` a cada tecla. A primeira versão não mostrava nada, e
 * uma senha longa digitada no escuro é indistinguível de um terminal travado.
 */

import { pool } from "./conexao.js";
import { gerarHash, validarSenha } from "../dominio/senha.js";
import { digitarPedaco, NADA_DIGITADO, proximaLinha, type Digitacao } from "../util/digitacao.js";

const argumentos = process.argv.slice(2);
const ativar = argumentos.includes("--ativar");
const email = argumentos.find((a) => !a.startsWith("--"));

async function listarUsuarios(): Promise<void> {
  const { rows } = await pool.query<{ email: string; nome: string; ativo: boolean; tem: boolean }>(
    `select email, nome, ativo, senha_hash is not null as tem from usuario order by nome`);
  console.log("\n  usuários cadastrados:\n");
  for (const u of rows) {
    console.log(`    ${u.email.padEnd(26)} ${u.nome.padEnd(10)} ` +
                `${u.ativo ? "ativo  " : "inativo"}  ${u.tem ? "com senha" : "sem senha"}`);
  }
  console.log("\n  uso: npm run senha -- <e-mail> [--ativar]\n");
}

// --------------------------------------------------------------- leitura

/**
 * Um leitor só, ligado uma vez e nunca desligado entre as perguntas.
 *
 * A versão anterior desligava e religava o stdin a cada pergunta, e o que
 * chegava no meio se perdia — inclusive o `\n` do Enter, que voltava depois e
 * respondia a pergunta seguinte sozinho.
 */
const linhasProntas: string[] = [];
let esperando: ((linha: string) => void) | null = null;
let estado: Digitacao = NADA_DIGITADO;
let ligado = false;

function ligarLeitor(): void {
  if (ligado) return;
  ligado = true;

  const entrada = process.stdin;
  entrada.setRawMode?.(true);
  entrada.resume();
  entrada.setEncoding("utf8");

  entrada.on("data", (pedaco: string) => {
    let restante = pedaco;
    while (restante) {
      const passo = digitarPedaco(estado, restante);
      // Só ecoa enquanto há pergunta na tela; o resto é digitação adiantada.
      if (passo.eco && esperando) process.stdout.write(passo.eco);
      estado = passo.estado;
      restante = passo.resto;

      if (estado.cancelada) {
        desligarLeitor();
        console.log("\n  cancelado.\n");
        process.exit(130);
      }
      if (!estado.concluida) break;

      const linha = estado.texto;
      estado = proximaLinha(estado);
      if (esperando) {
        const responder = esperando;
        esperando = null;
        responder(linha);
      } else {
        linhasProntas.push(linha);
      }
    }
  });
}

function desligarLeitor(): void {
  if (!ligado) return;
  ligado = false;
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
}

function lerSenha(rotulo: string): Promise<string> {
  // O leitor liga ANTES da pergunta aparecer. Enquanto o terminal não está em
  // modo bruto ele ecoa o que se digita e troca `\r` por `\n` — e quem colar a
  // senha no instante em que o prompt surge veria a senha na tela e teria o
  // segundo Enter contado como uma linha vazia. A fresta era pequena e real.
  ligarLeitor();
  process.stdout.write(rotulo);

  const pronta = linhasProntas.shift();
  if (pronta !== undefined) {
    process.stdout.write("\n");
    return Promise.resolve(pronta);
  }

  return new Promise((resolve) => { esperando = resolve; });
}

// ----------------------------------------------------------------- fluxo

async function principal(): Promise<number> {
  if (!email) {
    console.error("\n  informe o e-mail do usuário.");
    await listarUsuarios();
    return 1;
  }

  const { rows } = await pool.query<{ id: string; nome: string; email: string; ativo: boolean }>(
    "select id, nome, email, ativo from usuario where lower(email) = lower($1)", [email]);
  const usuario = rows[0];
  if (!usuario) {
    console.error(`\n  não existe usuário com o e-mail ${email}.`);
    await listarUsuarios();
    return 1;
  }

  // Já não há mais consulta ao banco pela frente: daqui em diante o terminal é
  // nosso, e nada do que for digitado aparece.
  ligarLeitor();
  console.log(`\n  definindo a senha de ${usuario.nome} <${usuario.email}>`);
  console.log("  a senha não aparece; cada tecla vira um ponto.\n");

  const senha = await lerSenha("  senha:      ");
  const recusa = validarSenha(senha, usuario.email);
  if (recusa) { console.error(`\n  ${recusa}\n`); return 1; }

  const confirmacao = await lerSenha("  repita:     ");
  if (senha !== confirmacao) { console.error("\n  as duas senhas não são iguais.\n"); return 1; }

  await pool.query(
    `update usuario set senha_hash = $2 ${ativar ? ", ativo = true" : ""} where id = $1`,
    [usuario.id, await gerarHash(senha)]);

  console.log(`\n  senha definida${ativar && !usuario.ativo ? " e acesso ativado" : ""}.`);
  if (!usuario.ativo && !ativar) {
    console.log("  atenção: este acesso está inativo e o login vai recusar.");
    console.log("  rode de novo com --ativar para liberar.");
  }
  console.log();
  return 0;
}

const codigo = await principal().catch((erro) => {
  console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
  return 1;
});
desligarLeitor();
await pool.end();
process.exit(codigo);
