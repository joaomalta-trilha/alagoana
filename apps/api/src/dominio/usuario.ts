/**
 * Regras de nome e e-mail de usuário.
 *
 * O e-mail é a identidade de quem entra: o login procura por ele, e a coluna é
 * única. Se um cadastro guardar `Joao@X.com` e outro `joao@x.com`, o banco
 * aceita os dois e o login passa a depender de como a pessoa digitou. Por isso
 * a normalização é obrigatória na entrada, e não uma gentileza da consulta.
 */

/** Aspas que aparecem ao colar de editor de texto ou de planilha. */
const ASPAS = /^["'‘’“”]+|["'‘’“”]+$/g;

/**
 * Deixa o e-mail na forma canônica: sem espaços, sem aspas em volta, minúsculo.
 *
 * A remoção de aspas não é preciosismo — o `~/.gitconfig` desta máquina tinha
 * um e-mail gravado como `“contato@…”`, com aspas tipográficas, e isso não é
 * visível a olho nu. Melhor limpar do que recusar por um caractere que a
 * pessoa não sabe que digitou.
 */
export function normalizarEmail(bruto: string): string {
  return bruto.trim().replace(ASPAS, "").trim().toLowerCase();
}

const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailValido(email: string): boolean {
  return FORMATO.test(email) && email.length <= 254;
}

export function nomeValido(nome: string): boolean {
  return nome.trim().length >= 2;
}

/** Devolve a mensagem de recusa, ou `null` quando os dois servem. */
export function validarUsuario(nome: string, email: string): string | null {
  if (!nomeValido(nome)) return "Informe o nome da pessoa.";
  if (!emailValido(normalizarEmail(email))) return `E-mail inválido: ${email.trim()}`;
  return null;
}
