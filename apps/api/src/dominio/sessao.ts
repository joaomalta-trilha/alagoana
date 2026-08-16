/**
 * Sessão — §5: cookie httpOnly, 30 dias, renovação por uso.
 *
 * Só as regras, sem banco e sem HTTP, para que os prazos sejam testáveis sem
 * subir nada e sem esperar um mês.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const NOME_COOKIE = "sessao";

/** §5: "expiração em 30 dias com renovação por uso". */
export const DURACAO_DIAS = 30;

/**
 * De quanto em quanto tempo a renovação chega ao banco.
 *
 * Renovar de verdade a cada requisição seria um UPDATE por clique. Um dia de
 * granularidade custa, no pior caso, um dia de validade a menos do que o
 * prometido, e troca isso por uma escrita diária por sessão.
 */
export const INTERVALO_RENOVACAO_HORAS = 24;

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;

/** Segredo que vai no cookie: 32 bytes aleatórios, 256 bits. */
export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * O que o banco guarda no lugar do token.
 *
 * sha256 e não argon2: ver o comentário da migração 0003. O token não é
 * escolhido por humano, então não há dicionário a defender.
 */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** Comparação de hashes sem vazar posição do primeiro byte diferente. */
export function mesmoHash(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function expiraEm(agora: Date): Date {
  return new Date(agora.getTime() + DURACAO_DIAS * DIA);
}

export function expirada(expiraEm: Date, agora: Date): boolean {
  return expiraEm.getTime() <= agora.getTime();
}

/** Vale a pena gravar a renovação, ou a sessão foi usada há pouco? */
export function precisaRenovar(ultimoUso: Date, agora: Date): boolean {
  return agora.getTime() - ultimoUso.getTime() >= INTERVALO_RENOVACAO_HORAS * HORA;
}

/** Max-Age do cookie, em segundos. */
export const MAX_AGE_SEGUNDOS = DURACAO_DIAS * 24 * 60 * 60;
