/** Leitura e escrita do cabeçalho Cookie, sem dependência. */

/** Lê o valor de um cookie do cabeçalho `Cookie:` da requisição. */
export function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const igual = parte.indexOf("=");
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() !== nome) continue;
    try {
      return decodeURIComponent(parte.slice(igual + 1).trim());
    } catch {
      return null;                                   // cookie malformado é cookie ausente
    }
  }
  return null;
}

export interface OpcoesCookie {
  maxAge?: number;                                   // segundos; 0 apaga
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
}

export function escreverCookie(nome: string, valor: string, o: OpcoesCookie = {}): string {
  const partes = [`${nome}=${encodeURIComponent(valor)}`];
  partes.push(`Path=${o.path ?? "/"}`);
  if (o.maxAge !== undefined) partes.push(`Max-Age=${Math.trunc(o.maxAge)}`);
  if (o.httpOnly !== false) partes.push("HttpOnly");
  if (o.secure) partes.push("Secure");
  partes.push(`SameSite=${o.sameSite ?? "Lax"}`);
  return partes.join("; ");
}
