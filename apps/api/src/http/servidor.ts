/**
 * O servidor: sessão (§5), a API de dados (§10 item 3) e a interface pronta.
 *
 * Em desenvolvimento quem serve a interface é o Vite, com proxy para cá. Em
 * produção este processo entrega `apps/web/dist`, e a origem passa a ser uma
 * só — que é o que faz o cookie `SameSite=Lax` da sessão valer sem CORS.
 *
 * `node:http` puro e nenhum framework: o roteamento cabe em `rotas.ts` e a
 * entrega de arquivo cabe em `estaticos.ts`.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { COOKIE_SEGURO, PORTA, PROXIES_CONFIAVEIS } from "../env.js";
import { pool } from "../db/conexao.js";
import { ipDoPedido } from "./ip.js";
import { MAX_AGE_SEGUNDOS, NOME_COOKIE } from "../dominio/sessao.js";
import { escreverCookie, lerCookie } from "./cookies.js";
import { abrirSessao, autenticar, fecharSessao, usuarioDaSessao } from "./autenticacao.js";
import { Freio } from "./freio.js";
import { comoCorpo } from "./corpo.js";
import { executar, metodosDe, resolver } from "./rotas.js";
import { existeBuild, servirEstatico } from "./estaticos.js";
import { ErroDeValidacao } from "../dominio/mensagens.js";

const LIMITE_CORPO = 8 * 1024;                       // nenhum pedido legítimo aqui é maior
const freio = new Freio();

// ------------------------------------------------------------------ utilidades

function responderJson(res: ServerResponse, status: number, corpo: unknown, cookie?: string): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(texto),
    "cache-control": "no-store",
    ...(cookie ? { "set-cookie": cookie } : {}),
  });
  res.end(texto);
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  let bruto = "";
  for await (const pedaco of req) {
    bruto += pedaco;
    if (bruto.length > LIMITE_CORPO) {
      throw new ErroDeValidacao("Corpo da requisição grande demais.", 413);
    }
  }
  if (!bruto) return {};
  return JSON.parse(bruto);
}

/**
 * IP de quem pediu — só para registro na sessão e para a chave do freio.
 *
 * Quantos proxies confiar vem do ambiente: sem proxy na frente, o cabeçalho
 * `X-Forwarded-For` é texto que qualquer um escreve; com proxy, ele é a única
 * fonte. Ver `CONFIAR_PROXY` em `env.ts` e a regra em `ip.ts`.
 */
const ipDe = (req: IncomingMessage) =>
  ipDoPedido(req.headers["x-forwarded-for"], req.socket.remoteAddress ?? null, PROXIES_CONFIAVEIS);

/**
 * Defesa em profundidade contra CSRF.
 *
 * O cookie é `SameSite=Lax`, o que já impede o navegador de mandá-lo num POST
 * vindo de outro site. Isto aqui é a segunda tranca, para o caso de um
 * navegador antigo.
 */
function origemEstranha(req: IncomingMessage): boolean {
  const origem = req.headers.origin;
  if (!origem) return false;                         // curl e afins não mandam Origin
  try {
    return new URL(origem).host !== req.headers.host;
  } catch {
    return true;
  }
}

const textoDe = (v: unknown) => (typeof v === "string" ? v : "");

// ---------------------------------------------------------------------- rotas

async function entrar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const corpo = await lerCorpo(req) as Record<string, unknown>;
  const email = textoDe(corpo["email"]).trim();
  const senha = textoDe(corpo["senha"]);

  if (!email || !senha) {
    responderJson(res, 400, { erro: "Preencha e-mail e senha." });
    return;
  }

  const chave = `${email.toLowerCase()}|${ipDe(req) ?? "?"}`;
  const espera = freio.esperaRestante(chave, Date.now());
  if (espera > 0) {
    const minutos = Math.ceil(espera / 60_000);
    responderJson(res, 429, {
      erro: `Tentativas demais. Tente de novo em ${minutos} minuto${minutos > 1 ? "s" : ""}.`,
    });
    return;
  }

  const r = await autenticar(email, senha);
  if (!r.ok) {
    freio.registrarFalha(chave, Date.now());
    responderJson(res, 401, {
      erro: r.motivo === "inativo"
        ? "Este acesso está desativado."
        : "E-mail ou senha incorretos.",
    });
    return;
  }

  freio.limpar(chave);
  const token = await abrirSessao(r.usuario.id, ipDe(req), req.headers["user-agent"] ?? null);
  responderJson(res, 200, { usuario: r.usuario }, escreverCookie(NOME_COOKIE, token, {
    maxAge: MAX_AGE_SEGUNDOS,
    httpOnly: true,
    secure: COOKIE_SEGURO,
    sameSite: "Lax",
  }));
}

async function sair(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await fecharSessao(lerCookie(req.headers.cookie, NOME_COOKIE));
  responderJson(res, 200, { ok: true }, escreverCookie(NOME_COOKIE, "", {
    maxAge: 0, httpOnly: true, secure: COOKIE_SEGURO, sameSite: "Lax",
  }));
}

async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const rota = `${req.method} ${url.pathname}`;

  if (req.method !== "GET" && req.method !== "HEAD" && origemEstranha(req)) {
    responderJson(res, 403, { erro: "Origem não permitida." });
    return;
  }

  switch (rota) {
    // Sem sessão de propósito: é a plataforma perguntando se o processo subiu.
    // Consulta o banco porque um processo de pé sem banco não serve para nada,
    // e responde só `ok` — quem verifica saúde não precisa saber mais que isso.
    case "GET /api/saude": {
      try {
        await pool.query("select 1");
        responderJson(res, 200, { ok: true });
      } catch {
        responderJson(res, 503, { ok: false });
      }
      return;
    }

    case "POST /api/sessao":
      return entrar(req, res);

    case "DELETE /api/sessao":
      return sair(req, res);

    case "GET /api/eu": {
      const usuario = await usuarioDaSessao(lerCookie(req.headers.cookie, NOME_COOKIE));
      if (!usuario) { responderJson(res, 401, { erro: "Sem sessão." }); return; }
      responderJson(res, 200, { usuario });
      return;
    }
  }

  // ----------------------------------------------------------- API de dados
  const resolvida = resolver(req.method ?? "GET", url.pathname);
  if (!resolvida) {
    // Fora de `/api`, o pedido é da interface: arquivo do build, ou o
    // `index.html` para as rotas que vivem do lado do cliente.
    if (!url.pathname.startsWith("/api/") && (req.method === "GET" || req.method === "HEAD")) {
      if (await servirEstatico(res, url.pathname)) return;
      responderJson(res, 503, {
        erro: "Interface não construída. Rode `npm run build` ou use `npm run dev`.",
      });
      return;
    }

    const outros = metodosDe(url.pathname);
    if (outros.length) {
      responderJson(res, 405, { erro: `Aqui só cabem: ${outros.join(", ")}.` });
    } else {
      responderJson(res, 404, { erro: "Rota inexistente." });
    }
    return;
  }

  // Nenhuma rota de dados responde sem sessão. A verificação fica aqui, uma
  // vez, e não em cada manipulador — é o único jeito de nenhuma esquecer.
  const usuario = await usuarioDaSessao(lerCookie(req.headers.cookie, NOME_COOKIE));
  if (!usuario) { responderJson(res, 401, { erro: "Sem sessão." }); return; }

  const corpo = req.method === "GET" || req.method === "DELETE"
    ? {}
    : comoCorpo(await lerCorpo(req));

  const { status, corpo: resposta } = await executar(resolvida, {
    usuario,
    parametros: resolvida.parametros,
    corpo,
    consulta: url.searchParams,
  });
  responderJson(res, status, resposta);
}

// -------------------------------------------------------------------- servidor

const servidor = createServer((req, res) => {
  tratar(req, res).catch((erro) => {
    if (res.headersSent) { res.end(); return; }

    // Recusa prevista: a mensagem é para o usuário ler, e a §8 exige que ela
    // seja específica. Qualquer outra coisa é defeito nosso — vira 500 e o
    // detalhe fica no log, porque texto de erro de banco não é interface.
    if (erro instanceof ErroDeValidacao) {
      responderJson(res, erro.status, { erro: erro.message });
      return;
    }
    if (erro instanceof SyntaxError) {
      responderJson(res, 400, { erro: "JSON inválido." });
      return;
    }
    console.error(`  erro em ${req.method} ${req.url}:`, erro);
    responderJson(res, 500, { erro: "Erro interno." });
  });
});

servidor.listen(PORTA, async () => {
  console.log(`  Alagoana · http://localhost:${PORTA}`);
  console.log(`  cookie ${COOKIE_SEGURO ? "Secure (exige HTTPS)" : "sem Secure (desenvolvimento)"}`);
  console.log(await existeBuild()
    ? "  interface: apps/web/dist"
    : "  interface: não construída — rode `npm run build`, ou `npm run dev` para o Vite\n");
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    servidor.close(() => { void pool.end().then(() => process.exit(0)); });
  });
}
