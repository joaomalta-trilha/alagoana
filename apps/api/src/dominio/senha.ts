/**
 * Senha — §3.1 e §5.
 *
 * argon2id com os parâmetros padrão do @node-rs/argon2 (m=19 MiB, t=2, p=1),
 * que são os recomendados pelo OWASP. O algoritmo e os parâmetros ficam
 * gravados dentro do próprio hash, no formato PHC — trocar o custo depois não
 * invalida as senhas existentes.
 */

import { hash, verify } from "@node-rs/argon2";

export const MIN_SENHA = 8;

/**
 * Devolve a mensagem de recusa, ou `null` quando a senha serve.
 *
 * Política deliberadamente curta: comprimento mínimo e nada de repetir o
 * e-mail. Regras de composição (símbolo, maiúscula, dígito) empurram gente
 * para "Senha@123" e não sobrevivem a três sócios que se conhecem.
 */
export function validarSenha(senha: string, email?: string): string | null {
  if (senha.length < MIN_SENHA) {
    return `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`;
  }
  if (email && senha.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "A senha não pode ser igual ao e-mail.";
  }
  return null;
}

/** Hash argon2id no formato PHC, pronto para ir em `usuario.senha_hash`. */
export function gerarHash(senha: string): Promise<string> {
  return hash(senha);
}

/**
 * Confere a senha contra o hash gravado.
 *
 * Nunca lança: hash corrompido ou de formato desconhecido é `false`, não erro
 * 500 na tela de login.
 */
export async function conferirSenha(hashGravado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashGravado, senha);
  } catch {
    return false;
  }
}

/**
 * Hash descartável, usado quando o e-mail não existe.
 *
 * O login precisa gastar o mesmo tempo com e-mail conhecido e desconhecido —
 * senão o tempo de resposta vira um oráculo de "esse e-mail tem conta aqui".
 * Gerado uma vez, na carga do módulo, a partir de um segredo aleatório que
 * ninguém jamais digitará.
 */
export const HASH_FANTASMA: Promise<string> = hash(
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
);
