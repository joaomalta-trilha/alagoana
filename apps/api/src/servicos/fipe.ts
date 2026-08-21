/**
 * A ponte com a tabela Fipe.
 *
 * Fonte: a API pública da parallelum, que espelha a Fipe e não pede chave.
 * Não tem contrato de disponibilidade — no dia em que este arquivo foi
 * escrito, uma fonte alternativa (BrasilAPI) devolvia 500 em três tentativas
 * seguidas. Por isso duas regras valem em todo lugar aqui:
 *
 *   1. **A Fipe nunca derruba uma operação da loja.** Lançar carro, vender,
 *      lançar custo — nada disso pode falhar porque um serviço de fora caiu.
 *      Quem chama recebe `null` e segue; a Fipe entra depois.
 *   2. **Cache do que não muda.** Marcas e modelos mudam uma vez por mês, no
 *      máximo. Consultá-los a cada abertura de tela seria castigar de graça
 *      um serviço gratuito.
 */

import type { PoolClient } from "pg";
import { paraNumeric, type Centavos } from "../dominio/dinheiro.js";
import {
  casarMarca, candidatosDeModelo, valorParaCentavos, anoDaFipe, tabelaMudou,
  tipoFipe, type TipoFipe,
} from "../dominio/fipe.js";
import type { TipoVeiculo } from "../dominio/tipo-veiculo.js";

const BASE = "https://parallelum.com.br/fipe/api/v1";

/** Curto de propósito: a tela espera, e a loja não pode esperar junto. */
const TEMPO_LIMITE_MS = 8_000;

/** Marca e modelo mudam no máximo uma vez por mês. */
const VALIDADE_CACHE_MS = 6 * 60 * 60 * 1_000;

export interface ItemFipe { codigo: string; nome: string }

export interface ValorFipe {
  valor: Centavos;
  referencia: string;
  versao: string;
  codigo: string;
}

const cache = new Map<string, { em: number; dado: unknown }>();

/**
 * Uma chamada à Fipe. Devolve `null` em qualquer tropeço.
 *
 * Erro de rede, timeout, 500, JSON estranho — tudo vira `null`, e o log fica
 * no servidor. Quem chama decide o que fazer sem conhecer HTTP.
 */
async function buscar<T>(caminho: string): Promise<T | null> {
  const guardado = cache.get(caminho);
  if (guardado && Date.now() - guardado.em < VALIDADE_CACHE_MS) {
    return guardado.dado as T;
  }

  const corte = AbortSignal.timeout(TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(`${BASE}${caminho}`, { signal: corte });
    if (!resposta.ok) {
      console.warn(`  fipe: ${resposta.status} em ${caminho}`);
      return null;
    }
    const dado = await resposta.json();
    // A API responde 200 com `{erro}` quando não acha — não é exceção, é dado.
    if (dado && typeof dado === "object" && "erro" in dado) {
      console.warn(`  fipe: ${(dado as { erro: string }).erro} em ${caminho}`);
      return null;
    }
    cache.set(caminho, { em: Date.now(), dado });
    return dado as T;
  } catch (e) {
    console.warn(`  fipe: ${e instanceof Error ? e.message : String(e)} em ${caminho}`);
    return null;
  }
}

export async function marcas(tipo: TipoFipe): Promise<ItemFipe[] | null> {
  return buscar<ItemFipe[]>(`/${tipo}/marcas`);
}

export async function modelos(tipo: TipoFipe, marca: string): Promise<ItemFipe[] | null> {
  const r = await buscar<{ modelos: ItemFipe[] }>(`/${tipo}/marcas/${marca}/modelos`);
  return r?.modelos ?? null;
}

export async function anos(
  tipo: TipoFipe, marca: string, modelo: string,
): Promise<ItemFipe[] | null> {
  return buscar<ItemFipe[]>(`/${tipo}/marcas/${marca}/modelos/${modelo}/anos`);
}

export async function valor(
  tipo: TipoFipe, marca: string, modelo: string, ano: string,
): Promise<ValorFipe | null> {
  const r = await buscar<{
    Valor: string; Modelo: string; MesReferencia: string; CodigoFipe: string;
  }>(`/${tipo}/marcas/${marca}/modelos/${modelo}/anos/${ano}`);
  if (!r) return null;

  const centavos = valorParaCentavos(r.Valor);
  if (centavos === null) return null;

  return {
    valor: centavos,
    referencia: r.MesReferencia.trim(),
    versao: r.Modelo,
    codigo: r.CodigoFipe,
  };
}

// ------------------------------------------------- o que a tela pergunta

export interface VersoesSugeridas {
  marcaCodigo: string;
  /** As versões que podem ser este carro, já filtradas pelo nome do modelo. */
  versoes: ItemFipe[];
  /** `true` quando o filtro não achou nada e a lista veio inteira. */
  listaInteira: boolean;
}

/**
 * As versões da Fipe candidatas a um veículo nosso.
 *
 * A marca é resolvida sozinha — das 47 do catálogo, 44 casam por caixa e três
 * têm apelido conhecido. O que sobra para a pessoa é escolher a versão, que é
 * a única coisa que o nosso cadastro não sabe.
 */
export async function versoesDe(
  tipo: TipoVeiculo, marca: string, modelo: string,
): Promise<VersoesSugeridas | null> {
  const catalogo = tipoFipe(tipo);
  if (!catalogo) return null;

  const todasAsMarcas = await marcas(catalogo);
  if (!todasAsMarcas) return null;

  const marcaCodigo = casarMarca(marca, todasAsMarcas);
  if (!marcaCodigo) return null;

  const lista = await modelos(catalogo, marcaCodigo);
  if (!lista) return null;

  const versoes = candidatosDeModelo(modelo, lista);
  return { marcaCodigo, versoes, listaInteira: versoes.length === lista.length };
}

// ------------------------------------------------------- gravar no veículo

interface EscolhaFipe {
  marcaCodigo: string;
  modeloCodigo: string;
  anoCodigo: string;
}

/**
 * Consulta a Fipe da escolha e grava no veículo.
 *
 * `naCompra` diz se `fipe_compra` também é gravada. Verdadeiro só quando o
 * carro está entrando: a Fipe na compra é o retrato do dia da entrada e não
 * se reescreve depois, nem quando a versão é corrigida — corrigir a versão
 * conserta o número de hoje, não reescreve a história.
 */
export async function gravarFipe(
  c: PoolClient, veiculoId: string, tipo: TipoVeiculo, escolha: EscolhaFipe,
  { naCompra }: { naCompra: boolean },
): Promise<ValorFipe | null> {
  const catalogo = tipoFipe(tipo);
  if (!catalogo) return null;

  const v = await valor(catalogo, escolha.marcaCodigo, escolha.modeloCodigo, escolha.anoCodigo);
  if (!v) return null;

  await c.query(
    `update veiculo
        set fipe_marca_codigo = $2, fipe_modelo_codigo = $3, fipe_ano_codigo = $4,
            fipe_versao = $5, fipe_codigo = $6, fipe_referencia = $7,
            fipe_hoje = $8, fipe_atualizada_em = now(),
            fipe_compra = case when $9 then $8 else fipe_compra end,
            atualizado_em = now()
      where id = $1`,
    [veiculoId, escolha.marcaCodigo, escolha.modeloCodigo, escolha.anoCodigo,
     v.versao, v.codigo, v.referencia, paraNumeric(v.valor), naCompra]);

  return v;
}

// ------------------------------------------------------ atualização mensal

export interface ResultadoAtualizacao {
  conferidos: number;
  atualizados: number;
  referencia: string | null;
  falhas: number;
}

/**
 * Reescreve a Fipe de hoje dos carros em pátio quando a tabela virou o mês.
 *
 * Só os que estão no pátio: a Fipe de um carro vendido não interessa mais, e
 * consultar 200 carros vendidos todo mês seria castigo à toa num serviço
 * gratuito.
 *
 * Cada carro é atualizado na sua própria consulta e falha sozinho — uma Fipe
 * que não respondeu não impede as outras de atualizarem.
 */
export async function atualizarFipeDeHoje(c: PoolClient): Promise<ResultadoAtualizacao> {
  const { rows } = await c.query<{
    id: string; tipo: TipoVeiculo; fipe_referencia: string | null;
    fipe_marca_codigo: string; fipe_modelo_codigo: string; fipe_ano_codigo: string;
  }>(
    `select id, tipo, fipe_referencia, fipe_marca_codigo, fipe_modelo_codigo, fipe_ano_codigo
       from veiculo
      where data_venda is null and fipe_modelo_codigo is not null
      order by codigo`);

  let atualizados = 0;
  let falhas = 0;
  let referencia: string | null = null;

  for (const v of rows) {
    const catalogo = tipoFipe(v.tipo);
    if (!catalogo) continue;

    const novo = await valor(
      catalogo, v.fipe_marca_codigo, v.fipe_modelo_codigo, v.fipe_ano_codigo);
    if (!novo) { falhas++; continue; }

    referencia = novo.referencia;
    if (!tabelaMudou(v.fipe_referencia, novo.referencia)) continue;

    await c.query(
      `update veiculo
          set fipe_hoje = $2, fipe_referencia = $3, fipe_versao = $4,
              fipe_atualizada_em = now()
        where id = $1`,
      [v.id, paraNumeric(novo.valor), novo.referencia, novo.versao]);
    atualizados++;
  }

  return { conferidos: rows.length, atualizados, referencia, falhas };
}

export { anoDaFipe };

/** Quanto tempo esperar antes de perguntar de novo se a tabela virou. */
const INTERVALO_DE_CONFERENCIA_MS = 12 * 60 * 60 * 1_000;

let conferindo = false;

/**
 * O "automaticamente" que a loja pediu, sem agendador.
 *
 * O Render não tem cron no plano em uso, e um serviço que dorme por
 * inatividade não roda tarefa de fundo mesmo. Então a conferência pega
 * carona na leitura do painel: se faz mais de meio dia que ninguém pergunta,
 * pergunta agora — em segundo plano, sem segurar a resposta da tela.
 *
 * `conferindo` evita que três sócios abrindo o painel ao mesmo tempo disparem
 * três varreduras.
 */
export function talvezAtualizar(
  rodar: (fn: (c: PoolClient) => Promise<unknown>) => Promise<unknown>,
): void {
  if (conferindo) return;
  conferindo = true;

  void (async () => {
    try {
      await rodar(async (c) => {
        const { rows } = await c.query<{ valor: string }>(
          "select valor from config where chave = 'fipe_verificada_em'");
        const ultima = rows[0] ? Date.parse(JSON.parse(rows[0].valor)) : 0;
        if (Date.now() - ultima < INTERVALO_DE_CONFERENCIA_MS) return;

        const r = await atualizarFipeDeHoje(c);
        await c.query(
          `insert into config (chave, valor) values ('fipe_verificada_em', $1)
           on conflict (chave) do update set valor = excluded.valor`,
          [JSON.stringify(new Date().toISOString())]);

        if (r.atualizados > 0) {
          console.log(`  fipe: ${r.atualizados} de ${r.conferidos} atualizados (${r.referencia})`);
        }
      });
    } catch (e) {
      console.warn(`  fipe: conferência falhou — ${e instanceof Error ? e.message : e}`);
    } finally {
      conferindo = false;
    }
  })();
}
