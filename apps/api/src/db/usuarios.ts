/**
 * Cadastro de usuários pela linha de comando.
 *
 *   npm run usuario                                          lista todos
 *   npm run usuario -- criar "Victor Malta" victor@x.com      cria
 *   npm run usuario -- email victor@alagoana.local victor@x.com   troca o e-mail
 *   npm run usuario -- ativar victor@x.com
 *   npm run usuario -- desativar ricardo@x.com
 *
 * Não define senha: quem faz isso é o `npm run senha`, e é de propósito que
 * sejam dois comandos. Criar alguém e dar acesso a alguém são decisões
 * diferentes, e um usuário recém-criado nasce sem poder entrar.
 *
 * Também não cria conta de caixa. Conta é onde o dinheiro fica (§3.2) e nem
 * todo usuário tem uma; os três sócios já têm a sua desde a carga inicial.
 */

import { pool } from "./conexao.js";
import { normalizarEmail, validarUsuario } from "../dominio/usuario.js";

interface Linha {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  tem_senha: boolean;
}

async function listar(): Promise<void> {
  const { rows } = await pool.query<Linha>(
    `select id, nome, email, papel, ativo, senha_hash is not null as tem_senha
       from usuario order by nome`);

  console.log("\n  usuários cadastrados:\n");
  for (const u of rows) {
    console.log(`    ${u.nome.padEnd(12)} ${u.email.padEnd(30)} ${u.papel.padEnd(8)}` +
                `${(u.ativo ? "ativo" : "inativo").padEnd(9)}${u.tem_senha ? "com senha" : "sem senha"}`);
  }
  console.log(`\n  ${rows.length} no total. Só entra quem está ativo e tem senha.\n`);
}

async function achar(email: string): Promise<Linha> {
  const { rows } = await pool.query<Linha>(
    `select id, nome, email, papel, ativo, senha_hash is not null as tem_senha
       from usuario where lower(email) = lower($1)`, [normalizarEmail(email)]);
  const u = rows[0];
  if (!u) throw new Error(`não existe usuário com o e-mail ${email}.`);
  return u;
}

async function emailJaUsado(email: string, exceto?: string): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*) n from usuario where lower(email) = lower($1) and ($2::uuid is null or id <> $2)`,
    [normalizarEmail(email), exceto ?? null]);
  return Number(rows[0]!.n) > 0;
}

async function criar(nome: string, email: string): Promise<void> {
  const recusa = validarUsuario(nome, email);
  if (recusa) throw new Error(recusa);

  const limpo = normalizarEmail(email);
  if (await emailJaUsado(limpo)) {
    throw new Error(`já existe usuário com o e-mail ${limpo}.`);
  }

  await pool.query(
    "insert into usuario (nome, email, papel, ativo) values ($1, $2, 'master', true)",
    [nome.trim(), limpo]);

  console.log(`\n  ${nome.trim()} <${limpo}> criado e ativo, ainda sem senha.`);
  console.log(`  para liberar o acesso:  npm run senha -- ${limpo}\n`);
}

async function trocarEmail(atual: string, novo: string): Promise<void> {
  const usuario = await achar(atual);
  const recusa = validarUsuario(usuario.nome, novo);
  if (recusa) throw new Error(recusa);

  const limpo = normalizarEmail(novo);
  if (await emailJaUsado(limpo, usuario.id)) {
    throw new Error(`já existe outro usuário com o e-mail ${limpo}.`);
  }

  await pool.query("update usuario set email = $2 where id = $1", [usuario.id, limpo]);
  console.log(`\n  ${usuario.nome}: ${usuario.email} → ${limpo}\n`);
}

async function definirAtivo(email: string, ativo: boolean): Promise<void> {
  const usuario = await achar(email);

  // Ninguém desativa o último acesso que funciona. Sem esta trava, um comando
  // distraído tranca a loja inteira para fora do próprio sistema, e a saída
  // seria mexer no banco à mão.
  if (!ativo) {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) n from usuario where ativo and senha_hash is not null and id <> $1`,
      [usuario.id]);
    if (Number(rows[0]!.n) === 0) {
      throw new Error(
        "este é o único acesso ativo com senha definida — desativá-lo trancaria todo mundo para fora.");
    }
  }

  await pool.query("update usuario set ativo = $2 where id = $1", [usuario.id, ativo]);
  console.log(`\n  ${usuario.nome} <${usuario.email}> agora está ${ativo ? "ativo" : "inativo"}.`);
  if (ativo && !usuario.tem_senha) {
    console.log(`  ainda falta a senha:  npm run senha -- ${usuario.email}`);
  }
  console.log();
}

function ajuda(): void {
  console.log(`
  uso:
    npm run usuario                                    lista todos
    npm run usuario -- criar "Nome" email@dominio      cria, ativo e sem senha
    npm run usuario -- email atual@x novo@y            troca o e-mail
    npm run usuario -- ativar email@dominio
    npm run usuario -- desativar email@dominio
`);
}

const [comando, ...resto] = process.argv.slice(2);

const acoes: Record<string, () => Promise<void>> = {
  criar: () => criar(resto[0] ?? "", resto[1] ?? ""),
  email: () => trocarEmail(resto[0] ?? "", resto[1] ?? ""),
  ativar: () => definirAtivo(resto[0] ?? "", true),
  desativar: () => definirAtivo(resto[0] ?? "", false),
};

let codigo = 0;
try {
  if (!comando) {
    await listar();
  } else if (acoes[comando]) {
    await acoes[comando]!();
    await listar();
  } else {
    console.error(`\n  comando desconhecido: ${comando}`);
    ajuda();
    codigo = 1;
  }
} catch (erro) {
  console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
  codigo = 1;
}

await pool.end();
process.exit(codigo);
