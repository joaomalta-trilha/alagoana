import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

function obrigatorio(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`variável de ambiente ausente: ${nome}`);
  return valor;
}

const ligado = (nome: string): boolean =>
  ["1", "true", "sim"].includes((process.env[nome] ?? "").toLowerCase());

export const DATABASE_URL = obrigatorio("DATABASE_URL");

export const PORTA = Number(process.env["PORT"] ?? 3000);

/**
 * Marca o cookie de sessão como `Secure` — o navegador só o devolve por HTTPS.
 *
 * Fica desligado por padrão porque em desenvolvimento a origem é
 * `http://localhost`, e um cookie `Secure` simplesmente não seria enviado, o
 * que apareceria como "o login não funciona". Em produção, ligue.
 */
export const COOKIE_SEGURO = ligado("COOKIE_SEGURO") || process.env["NODE_ENV"] === "production";

/**
 * Quantos proxies existem na frente deste processo.
 *
 * Zero — o padrão — significa que o IP de quem pediu é o do socket, e
 * `X-Forwarded-For` é texto que qualquer um escreve, então se ignora.
 *
 * Atrás de um PaaS há sempre um proxy, e aí o socket passa a ser sempre o
 * mesmo endereço: sem este ajuste, o freio de login trataria a loja inteira
 * como um único visitante e cinco senhas erradas de qualquer pessoa
 * trancariam o acesso de todo mundo. Em produção no Render, vale 1.
 */
export const PROXIES_CONFIAVEIS = Number(process.env["CONFIAR_PROXY"] ?? 0);

/**
 * O fuso das datas de negócio. **Não** sai de `TZ`.
 *
 * Quase toda plataforma de nuvem define `TZ=UTC` no ambiente. Se "hoje"
 * dependesse dessa variável, das 21h à meia-noite de Maceió o sistema acharia
 * que já é o dia seguinte — e isso contaminaria dias em pátio, garantia e a
 * data que a tela de lançamento sugere. A loja fica em Maceió, que não tem
 * horário de verão; é um fato do negócio, não uma configuração de máquina.
 */
export const FUSO_DO_NEGOCIO = "America/Maceio";

/** Hoje em Maceió, no formato AAAA-MM-DD. */
export function hoje(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_DO_NEGOCIO }).format(new Date());
}
