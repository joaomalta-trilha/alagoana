/**
 * Autenticação — §5. A parte que fala com o banco.
 *
 * As regras de prazo estão em `dominio/sessao.ts` e as de hash em
 * `dominio/senha.ts`; aqui só se traduz uma coisa na outra.
 */

import { pool } from "../db/conexao.js";
import { conferirSenha, HASH_FANTASMA } from "../dominio/senha.js";
import {
  expiraEm, expirada, hashToken, novoToken, precisaRenovar,
} from "../dominio/sessao.js";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: "master" | "vendedor";
  ativo: boolean;
}

export type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: "credenciais" | "inativo" };

interface LinhaUsuario extends Usuario {
  senha_hash: string | null;
}

/**
 * Confere e-mail e senha.
 *
 * E-mail desconhecido, senha errada e usuário que ainda não definiu senha
 * devolvem exatamente o mesmo resultado, no mesmo tempo: distinguir os três
 * transformaria a tela de login num verificador de "esse e-mail tem conta
 * aqui". Quem está no primeiro acesso é atendido pelo rodapé da tela, que
 * ensina o comando de definir senha sem precisar perguntar nada ao servidor.
 *
 * `inativo` é diferente: só se chega lá com a senha certa na mão, então não há
 * o que vazar, e a pessoa merece saber por que não entra.
 */
export async function autenticar(email: string, senha: string): Promise<ResultadoLogin> {
  const { rows } = await pool.query<LinhaUsuario>(
    `select id, nome, email, papel, ativo, senha_hash
       from usuario where lower(email) = lower($1)`,
    [email.trim()],
  );

  const u = rows[0];
  // Sem usuário ou sem senha definida: gasta o mesmo argon2 do caminho feliz,
  // para que o relógio não responda o que a mensagem se recusa a responder.
  if (!u?.senha_hash) {
    await conferirSenha(await HASH_FANTASMA, senha);
    return { ok: false, motivo: "credenciais" };
  }

  if (!(await conferirSenha(u.senha_hash, senha))) {
    return { ok: false, motivo: "credenciais" };
  }
  if (!u.ativo) return { ok: false, motivo: "inativo" };

  const { senha_hash: _, ...usuario } = u;
  return { ok: true, usuario };
}

/** Grava a sessão e devolve o token que vai no cookie — o banco só vê o hash. */
export async function abrirSessao(
  usuarioId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const token = novoToken();
  await pool.query(
    `insert into sessao (usuario_id, token_hash, expira_em, ip, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [usuarioId, hashToken(token), expiraEm(new Date()), ip, userAgent],
  );
  // Varre o que já venceu. O login é raro o bastante para pagar por isso e
  // frequente o bastante para a tabela nunca virar depósito.
  await pool.query("delete from sessao where expira_em < now()");
  return token;
}

/**
 * Quem é o dono do token, se é que ainda é de alguém.
 *
 * Renova a expiração por uso (§5), no máximo uma vez por dia — ver
 * `INTERVALO_RENOVACAO_HORAS`.
 */
export async function usuarioDaSessao(token: string | null): Promise<Usuario | null> {
  if (!token) return null;

  const { rows } = await pool.query<{
    sessao_id: string; expira_em: Date; ultimo_uso_em: Date;
  } & Usuario>(
    `select s.id as sessao_id, s.expira_em, s.ultimo_uso_em,
            u.id, u.nome, u.email, u.papel, u.ativo
       from sessao s
       join usuario u on u.id = s.usuario_id
      where s.token_hash = $1`,
    [hashToken(token)],
  );

  const s = rows[0];
  if (!s) return null;

  const agora = new Date();
  if (expirada(s.expira_em, agora)) {
    await pool.query("delete from sessao where id = $1", [s.sessao_id]);
    return null;
  }
  // Desativar alguém derruba o acesso na próxima requisição, sem precisar
  // caçar as sessões abertas dessa pessoa.
  if (!s.ativo) return null;

  if (precisaRenovar(s.ultimo_uso_em, agora)) {
    await pool.query(
      "update sessao set expira_em = $2, ultimo_uso_em = $3 where id = $1",
      [s.sessao_id, expiraEm(agora), agora],
    );
  }

  return { id: s.id, nome: s.nome, email: s.email, papel: s.papel, ativo: s.ativo };
}

export async function fecharSessao(token: string | null): Promise<void> {
  if (!token) return;
  await pool.query("delete from sessao where token_hash = $1", [hashToken(token)]);
}
