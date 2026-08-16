/**
 * Entrega a interface construída (`apps/web/dist`).
 *
 * Em desenvolvimento quem serve a interface é o Vite, com proxy para cá; em
 * produção é este arquivo, e assim a origem é uma só — que é o que faz o
 * cookie `SameSite=Lax` da sessão continuar valendo sem configuração de CORS.
 *
 * O app tem rotas do lado do cliente, então qualquer caminho que não seja
 * arquivo cai no `index.html`. Sem isso, recarregar a página numa tela interna
 * daria 404.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const PASTA_WEB = resolve(AQUI, "../../../web/dist");

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export async function existeBuild(): Promise<boolean> {
  try {
    return (await stat(join(PASTA_WEB, "index.html"))).isFile();
  } catch {
    return false;
  }
}

async function arquivo(caminho: string): Promise<string | null> {
  try {
    return (await stat(caminho)).isFile() ? caminho : null;
  } catch {
    return null;
  }
}

export async function servirEstatico(res: ServerResponse, caminhoUrl: string): Promise<boolean> {
  // `normalize` resolve os `..` e o prefixo confirma que não saímos da pasta —
  // sem isso, `/../../.env` seria um pedido válido.
  const pedido = normalize(join(PASTA_WEB, decodeURIComponent(caminhoUrl)));
  if (pedido !== PASTA_WEB && !pedido.startsWith(PASTA_WEB + "/")) return false;

  const alvo = await arquivo(pedido) ?? await arquivo(join(PASTA_WEB, "index.html"));
  if (!alvo) return false;

  const extensao = extname(alvo);
  // Os arquivos com hash no nome podem ser cacheados para sempre; o index.html
  // e o service worker, nunca — são eles que apontam para as versões novas.
  const eterno = alvo.includes("/assets/");

  res.writeHead(200, {
    "content-type": TIPOS[extensao] ?? "application/octet-stream",
    "cache-control": eterno ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(alvo).pipe(res);
  return true;
}
