/**
 * De quem veio o pedido.
 *
 * Serve para a chave do freio de login e para o registro na sessão. Errar aqui
 * não dá erro: dá um freio que tranca todo mundo junto, ou um freio que não
 * tranca ninguém. Por isso a regra é uma função pura, com teste.
 */

/**
 * `X-Forwarded-For` é uma lista onde **cada proxy acrescenta quem falou com
 * ele**. Numa cadeia `cliente → P1 → P2 → app`, chega `cliente, P1`.
 *
 * Então, confiando em N proxies, o endereço real está N posições antes do fim.
 * O começo da lista é escrito pelo próprio cliente e não vale nada: quem
 * pegasse o primeiro item estaria deixando qualquer um escolher o próprio IP —
 * e, com isso, escapar do freio trocando de identidade a cada tentativa.
 */
export function ipDoPedido(
  cabecalho: string | string[] | undefined,
  ipDoSocket: string | null,
  proxiesConfiaveis: number,
): string | null {
  if (proxiesConfiaveis <= 0) return ipDoSocket;

  const lista = (Array.isArray(cabecalho) ? cabecalho.join(",") : cabecalho ?? "")
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);

  if (lista.length === 0) return ipDoSocket;

  const posicao = Math.max(0, lista.length - proxiesConfiaveis);
  return lista[posicao] ?? ipDoSocket;
}
