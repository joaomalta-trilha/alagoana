/**
 * A API da §10 item 3.
 *
 * Uma tabela de rotas, um manipulador por linha. Leitura empresta um cliente
 * do pool; escrita abre transação — e é sempre uma transação por requisição,
 * porque venda com troca, rateio de custo e aporte são vários INSERTs que só
 * fazem sentido juntos.
 *
 * Dinheiro entra e sai em centavos inteiros. Ver `corpo.ts`.
 */

import { comLeitura, comTransacao } from "../db/conexao.js";
import { hoje } from "../env.js";
import { ErroDeValidacao } from "../dominio/mensagens.js";
import { lerFiltros } from "../dominio/filtros.js";
import { lerTipo, temCatalogo, type TipoComCatalogo } from "../dominio/tipo-veiculo.js";
import { filtrarListaPorPapel, filtrarPorPapel, veFinanceiro } from "../dominio/papel.js";
import type { Usuario } from "./autenticacao.js";
import {
  booleano, centavos, comoCorpo, contaOpcional, data, inteiro, listaDeTexto,
  objeto, texto, uuid, uuidDoCorpo, type Corpo,
  listaDeObjetos,
} from "./corpo.js";

import {
  incluirCor, incluirMarca, incluirModelo, listarCatalogos,
} from "../servicos/catalogos.js";
import {
  criarVeiculo, editarVeiculo, excluirVeiculo, previaExclusao, venderVeiculo,
  previaDesfazerVenda, desfazerVenda,
  type EntradaTroca, type EntradaVeiculo,
} from "../servicos/veiculos.js";
import { atalhos, excluirCusto, lancarCusto, type ModoRateio } from "../servicos/custos.js";
import { registrarAporte, transferir } from "../servicos/caixa.js";
import {
  consolidadoVendas, ficha, listarVeiculos, painel, totalizar, visaoCaixa, type Situacao,
} from "../servicos/consultas.js";

export interface Contexto {
  usuario: Usuario;
  parametros: Record<string, string>;
  corpo: Corpo;
  consulta: URLSearchParams;
}

interface Rota {
  metodo: string;
  padrao: string;
  status?: number;
  fn: (ctx: Contexto) => Promise<unknown>;
}

// ------------------------------------------------------------------ leitura

const listar = async (ctx: Contexto) => {
  const pedida = ctx.consulta.get("situacao") ?? "todos";
  if (!["estoque", "vendido", "todos"].includes(pedida)) {
    throw new ErroDeValidacao("situacao precisa ser estoque, vendido ou todos.", 400);
  }
  const veiculos = await comLeitura((c) =>
    listarVeiculos(c, pedida as Situacao, hoje(), lerFiltros(ctx.consulta)));
  return {
    veiculos: filtrarListaPorPapel(veiculos, ctx.usuario.papel),
    // Totais são financeiro: quem não vê margem também não vê soma.
    ...(veFinanceiro(ctx.usuario.papel) ? { totais: totalizar(veiculos) } : {}),
  };
};

// ------------------------------------------------------------- leitura corpo

/** Os campos de veículo que criar e editar compartilham. */
function lerVeiculo(c: Corpo): Partial<EntradaVeiculo> {
  const entrada: Partial<EntradaVeiculo> = {};
  const atribuir = <K extends keyof EntradaVeiculo>(campo: K, valor: EntradaVeiculo[K] | null) => {
    if (campo in c) entrada[campo] = valor as EntradaVeiculo[K];
  };

  // O tipo vem antes de marca porque é ele que decide qual catálogo vale.
  if ("tipo" in c) entrada.tipo = lerTipo(texto(c, "tipo"));
  atribuir("marca", texto(c, "marca"));
  atribuir("modelo", texto(c, "modelo"));
  atribuir("versao", texto(c, "versao"));
  atribuir("ano", inteiro(c, "ano"));
  atribuir("cor", texto(c, "cor"));
  atribuir("placa", texto(c, "placa"));
  atribuir("km", inteiro(c, "km"));
  atribuir("dataCompra", data(c, "dataCompra"));
  atribuir("valorCompra", centavos(c, "valorCompra"));
  atribuir("valorAnuncio", centavos(c, "valorAnuncio"));
  atribuir("fipeCompra", centavos(c, "fipeCompra"));
  atribuir("fipeHoje", centavos(c, "fipeHoje"));
  atribuir("observacao", texto(c, "observacao"));
  atribuir("contaId", contaOpcional(c));
  return entrada;
}

/**
 * Os veículos recebidos na troca.
 *
 * Aceita `trocas` (lista) e também `troca` (um objeto), que é como a primeira
 * versão mandava. Ler os dois custa duas linhas e evita que um cliente antigo
 * — uma aba aberta desde antes do deploy — perca a troca em silêncio.
 */
function lerTrocas(c: Corpo): EntradaTroca[] {
  const lista = listaDeObjetos(c, "trocas");
  const um = objeto(c, "troca");
  const brutas = lista.length ? lista : um ? [um] : [];
  return brutas.map(lerTroca);
}

function lerTroca(t: Corpo): EntradaTroca {
  const modo = texto(t, "modo") ?? "avaliacao";
  if (modo !== "avaliacao" && modo !== "mercado") {
    throw new ErroDeValidacao("O modo da troca é 'avaliacao' ou 'mercado'.", 400);
  }
  return {
    tipo: lerTipo(texto(t, "tipo")),
    marca: texto(t, "marca") ?? "",
    modelo: texto(t, "modelo") ?? "",
    versao: texto(t, "versao"),
    ano: inteiro(t, "ano"),
    cor: texto(t, "cor") ?? "",
    placa: texto(t, "placa") ?? "",
    km: inteiro(t, "km"),
    avaliacao: centavos(t, "avaliacao") ?? 0,
    mercado: centavos(t, "mercado"),
    modo,
    valorAnuncio: centavos(t, "valorAnuncio"),
  };
}

/**
 * O tipo de um pedido de catálogo. `outro` não tem catálogo, então tentar
 * incluir marca ali é engano de quem chamou, não silêncio.
 */
function tipoDoCatalogo(c: Corpo): TipoComCatalogo {
  const tipo = lerTipo(texto(c, "tipo"));
  if (!temCatalogo(tipo)) {
    throw new ErroDeValidacao("Só carro e moto têm catálogo de marca.", 400);
  }
  return tipo as TipoComCatalogo;
}

// -------------------------------------------------------------------- tabela

const ROTAS: Rota[] = [
  // ---------------------------------------------------------- catálogos
  {
    metodo: "GET", padrao: "/api/catalogos",
    fn: () => comLeitura(listarCatalogos),
  },
  {
    metodo: "POST", padrao: "/api/catalogos/marcas", status: 201,
    fn: async (ctx) => {
      const tipo = tipoDoCatalogo(ctx.corpo);
      await comTransacao((c) => incluirMarca(c, texto(ctx.corpo, "nome") ?? "", tipo));
      return { ok: true };
    },
  },
  {
    metodo: "POST", padrao: "/api/catalogos/modelos", status: 201,
    fn: async (ctx) => {
      await comTransacao((c) =>
        incluirModelo(c, texto(ctx.corpo, "marca") ?? "", texto(ctx.corpo, "nome") ?? "",
                      tipoDoCatalogo(ctx.corpo)));
      return { ok: true };
    },
  },
  {
    metodo: "POST", padrao: "/api/catalogos/cores", status: 201,
    fn: async (ctx) => {
      await comTransacao((c) => incluirCor(c, texto(ctx.corpo, "nome") ?? ""));
      return { ok: true };
    },
  },

  // ------------------------------------------------------------ veículos
  { metodo: "GET", padrao: "/api/veiculos", fn: listar },
  {
    metodo: "POST", padrao: "/api/veiculos", status: 201,
    fn: async (ctx) => {
      const entrada = lerVeiculo(ctx.corpo) as EntradaVeiculo;
      return comTransacao((c) => criarVeiculo(c, entrada, ctx.usuario.id));
    },
  },
  {
    metodo: "GET", padrao: "/api/veiculos/:id",
    fn: async (ctx) => {
      const dados = await comLeitura((c) => ficha(c, ctx.parametros["id"]!, hoje()));
      return filtrarPorPapel(dados, ctx.usuario.papel);
    },
  },
  {
    metodo: "PATCH", padrao: "/api/veiculos/:id",
    fn: async (ctx) => {
      const entrada = {
        ...lerVeiculo(ctx.corpo),
        ...("dataVenda" in ctx.corpo ? { dataVenda: data(ctx.corpo, "dataVenda") } : {}),
        ...("valorVenda" in ctx.corpo ? { valorVenda: centavos(ctx.corpo, "valorVenda") } : {}),
      };
      await comTransacao((c) => editarVeiculo(c, ctx.parametros["id"]!, entrada, ctx.usuario.id));
      return comLeitura((c) => ficha(c, ctx.parametros["id"]!, hoje()));
    },
  },
  {
    // A confirmação da §4.8, com números reais, antes de qualquer exclusão.
    metodo: "GET", padrao: "/api/veiculos/:id/exclusao",
    fn: (ctx) => comLeitura((c) => previaExclusao(c, ctx.parametros["id"]!)),
  },
  {
    metodo: "DELETE", padrao: "/api/veiculos/:id",
    fn: (ctx) => comTransacao((c) => excluirVeiculo(c, ctx.parametros["id"]!, ctx.usuario.id)),
  },
  {
    metodo: "POST", padrao: "/api/veiculos/:id/venda", status: 201,
    fn: async (ctx) => {
      const entrada = {
        dataVenda: data(ctx.corpo, "dataVenda") ?? hoje(),
        valorVenda: centavos(ctx.corpo, "valorVenda") ?? 0,
        contaId: contaOpcional(ctx.corpo),
        ...(booleano(ctx.corpo, "lancarComissoes") !== null
          ? { lancarComissoes: booleano(ctx.corpo, "lancarComissoes")! }
          : {}),
        trocas: lerTrocas(ctx.corpo),
      };
      const resultado = await comTransacao((c) =>
        venderVeiculo(c, ctx.parametros["id"]!, entrada, ctx.usuario.id));
      const atualizada = await comLeitura((c) => ficha(c, ctx.parametros["id"]!, hoje()));
      return { ...resultado, veiculo: filtrarPorPapel(atualizada, ctx.usuario.papel) };
    },
  },

  {
    // A conta do estrago antes de desfazer, como a §4.8 pede para excluir.
    metodo: "GET", padrao: "/api/veiculos/:id/venda",
    fn: (ctx) => comLeitura((c) => previaDesfazerVenda(c, ctx.parametros["id"]!)),
  },
  {
    metodo: "DELETE", padrao: "/api/veiculos/:id/venda",
    fn: async (ctx) => {
      const desfeita = await comTransacao((c) =>
        desfazerVenda(c, ctx.parametros["id"]!, ctx.usuario.id));
      const atualizada = await comLeitura((c) => ficha(c, ctx.parametros["id"]!, hoje()));
      return { desfeita, veiculo: filtrarPorPapel(atualizada, ctx.usuario.papel) };
    },
  },

  // -------------------------------------------------------------- custos
  { metodo: "GET", padrao: "/api/custos/atalhos", fn: () => comLeitura((c) => atalhos(c)) },
  {
    metodo: "POST", padrao: "/api/custos", status: 201,
    fn: async (ctx) => {
      const modo = texto(ctx.corpo, "modoRateio") ?? "mesmo";
      if (modo !== "mesmo" && modo !== "dividir") {
        throw new ErroDeValidacao("O rateio é 'mesmo' ou 'dividir'.", 400);
      }
      // Aceita um id só ou a lista do rateio (§6.7).
      const ids = listaDeTexto(ctx.corpo, "veiculoIds");
      const um = uuidDoCorpo(ctx.corpo, "veiculoId");
      const veiculoIds = (ids.length ? ids : um ? [um] : [])
        .map((id) => uuid(id, "O id do veículo")!);

      const lancados = await comTransacao((c) => lancarCusto(c, {
        veiculoIds,
        descricao: texto(ctx.corpo, "descricao") ?? "",
        categoria: texto(ctx.corpo, "categoria") ?? "",
        data: data(ctx.corpo, "data"),
        valor: centavos(ctx.corpo, "valor") ?? 0,
        modoRateio: modo as ModoRateio,
        previsto: booleano(ctx.corpo, "previsto") ?? false,
        contaId: contaOpcional(ctx.corpo),
      }, ctx.usuario.id));
      return { lancados };
    },
  },
  {
    metodo: "DELETE", padrao: "/api/custos/:id",
    fn: (ctx) => comTransacao((c) => excluirCusto(c, ctx.parametros["id"]!, ctx.usuario.id)),
  },

  // --------------------------------------------------------------- caixa
  { metodo: "GET", padrao: "/api/caixa", fn: () => comLeitura((c) => visaoCaixa(c)) },
  {
    metodo: "POST", padrao: "/api/aportes", status: 201,
    fn: async (ctx) => {
      const tipo = texto(ctx.corpo, "tipo") ?? "aporte";
      if (tipo !== "aporte" && tipo !== "retirada") {
        throw new ErroDeValidacao("O tipo é 'aporte' ou 'retirada'.", 400);
      }
      const contaId = uuidDoCorpo(ctx.corpo, "contaId");
      if (!contaId) throw new ErroDeValidacao("Escolha a conta do aporte.", 400);

      const id = await comTransacao((c) => registrarAporte(c, {
        socioId: uuidDoCorpo(ctx.corpo, "socioId") ?? "",
        contaId,
        data: data(ctx.corpo, "data") ?? hoje(),
        tipo,
        valor: centavos(ctx.corpo, "valor") ?? 0,
        observacao: texto(ctx.corpo, "observacao"),
      }, ctx.usuario.id));
      return { id };
    },
  },

  {
    metodo: "POST", padrao: "/api/transferencias", status: 201,
    fn: (ctx) => {
      const origemId = uuidDoCorpo(ctx.corpo, "origemId");
      const destinoId = uuidDoCorpo(ctx.corpo, "destinoId");
      if (!origemId || !destinoId) {
        throw new ErroDeValidacao("Escolha a conta de origem e a de destino.", 400);
      }
      return comTransacao((c) => transferir(c, {
        origemId, destinoId,
        data: data(ctx.corpo, "data") ?? hoje(),
        valor: centavos(ctx.corpo, "valor") ?? 0,
        observacao: texto(ctx.corpo, "observacao"),
      }, ctx.usuario.id));
    },
  },

  // ------------------------------------------------------- painel e vendas
  // Os filtros da §6.1 valem em todas as telas ao mesmo tempo, então as três
  // rotas de leitura leem os mesmos parâmetros.
  {
    metodo: "GET", padrao: "/api/painel",
    fn: (ctx) => comLeitura((c) => painel(c, hoje(), lerFiltros(ctx.consulta))),
  },
  {
    metodo: "GET", padrao: "/api/vendas",
    fn: async (ctx) => {
      const r = await comLeitura((c) => consolidadoVendas(c, hoje(), lerFiltros(ctx.consulta)));
      return { ...r, veiculos: filtrarListaPorPapel(r.veiculos, ctx.usuario.papel) };
    },
  },
];

// ------------------------------------------------------------------ despacho

export interface RotaResolvida {
  rota: Rota;
  parametros: Record<string, string>;
}

/**
 * Casa método e caminho com a tabela.
 *
 * Segmento literal ganha de `:parametro`, e por isso `/api/custos/atalhos`
 * nunca é confundido com `/api/custos/:id` — a ordem de declaração da tabela
 * deixa de importar, que é o que evita o bug clássico de rota engolida.
 */
export function resolver(metodo: string, caminho: string): RotaResolvida | null {
  const partes = caminho.split("/").filter(Boolean);
  let melhor: RotaResolvida | null = null;
  let melhorPontos = -1;

  for (const rota of ROTAS) {
    if (rota.metodo !== metodo) continue;
    const alvo = rota.padrao.split("/").filter(Boolean);
    if (alvo.length !== partes.length) continue;

    const parametros: Record<string, string> = {};
    let pontos = 0;
    let casou = true;

    for (const [i, segmento] of alvo.entries()) {
      const dado = partes[i]!;
      if (segmento.startsWith(":")) parametros[segmento.slice(1)] = decodeURIComponent(dado);
      else if (segmento === dado) pontos++;
      else { casou = false; break; }
    }

    if (casou && pontos > melhorPontos) {
      melhor = { rota, parametros };
      melhorPontos = pontos;
    }
  }
  return melhor;
}

/** Existe o caminho, mas não com este método? Serve para responder 405. */
export function metodosDe(caminho: string): string[] {
  return [...new Set(ROTAS
    .filter((r) => resolverPadrao(r.padrao, caminho))
    .map((r) => r.metodo))];
}

function resolverPadrao(padrao: string, caminho: string): boolean {
  const alvo = padrao.split("/").filter(Boolean);
  const partes = caminho.split("/").filter(Boolean);
  return alvo.length === partes.length &&
    alvo.every((s, i) => s.startsWith(":") || s === partes[i]);
}

export async function executar(resolvida: RotaResolvida, ctx: Contexto): Promise<{
  status: number; corpo: unknown;
}> {
  const corpo = await resolvida.rota.fn(ctx);
  return { status: resolvida.rota.status ?? 200, corpo };
}

export { ROTAS };
