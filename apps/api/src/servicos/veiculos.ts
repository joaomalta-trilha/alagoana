/**
 * Veículo — cadastro, edição, exclusão e venda.
 *
 * Todas as funções recebem o cliente da transação de fora: uma venda com troca
 * são três gravações que só fazem sentido juntas (§4.5), e quem abre a
 * transação é a rota.
 *
 * As contas de dinheiro não moram aqui — moram em `dominio/veiculo.ts`. Este
 * arquivo só sabe traduzir intenção em linhas de tabela.
 */

import type { PoolClient } from "pg";
import { paraNumeric, deNumeric, type Centavos } from "../dominio/dinheiro.js";
import {
  ErroDeValidacao, MSG, NaoEncontrado, trocaImpedeDesfazer, saldoNaoDevolveVenda,
} from "../dominio/mensagens.js";
import { calcularTrocas, type DataISO, type ModoTroca } from "../dominio/veiculo.js";
import {
  CATEGORIA_COMISSAO, lerComissoes, marcarComissoesPorPadrao, type Comissao,
} from "../dominio/comissao.js";
import { garantirCatalogo } from "./catalogos.js";
import { lerTipo, type TipoVeiculo } from "../dominio/tipo-veiculo.js";
import { registrarEvento } from "./eventos.js";
import { registrarMovimento, registrarMovimentoOpcional, refazerMovimentoDoVeiculo } from "./caixa.js";

export interface EntradaVeiculo {
  /** Ausente vira `carro`: é o caso comum e ninguém deve pensar nele. */
  tipo?: TipoVeiculo;
  marca: string;
  modelo: string;
  versao?: string | null;
  ano?: number | null;
  cor: string;
  placa: string;
  km?: number | null;
  dataCompra: DataISO;
  valorCompra: Centavos;
  valorAnuncio?: Centavos | null;
  fipeCompra?: Centavos | null;
  fipeHoje?: Centavos | null;
  observacao?: string | null;
  /**
   * Provisiona a comissão da §4.6 como custo previsto, ligado por padrão.
   *
   * Existe para poder ser desligado: o repasse — carro comprado e passado
   * adiante pelo mesmo valor no dia seguinte, que a frota tem — não paga
   * comissão, e os testes dos exemplos da especificação precisam dos números
   * do documento, sem ela.
   */
  provisionarComissao?: boolean;
  /** Nulo = "Não descontar do caixa" (§4.7). */
  contaId?: string | null;
}

export interface EntradaTroca {
  /** Moto na troca de um carro é o caso mais comum de todos. */
  tipo?: TipoVeiculo;
  marca: string;
  modelo: string;
  versao?: string | null;
  ano?: number | null;
  cor: string;
  placa: string;
  km?: number | null;
  avaliacao: Centavos;
  mercado?: Centavos | null;
  modo: ModoTroca;
  valorAnuncio?: Centavos | null;
  /** Como no lançamento de carro: ligado por padrão, desligável. */
  provisionarComissao?: boolean;
}

export interface EntradaVenda {
  dataVenda: DataISO;
  valorVenda: Centavos;
  contaId?: string | null;
  /** Omitido, segue a regra do checkbox da §4.6. */
  lancarComissoes?: boolean;
  /** Numa venda pode entrar mais de um veículo — dois carros, carro e moto. */
  trocas?: EntradaTroca[] | null;
}

interface LinhaVeiculo {
  id: string;
  codigo: string;
  marca: string;
  modelo: string;
  placa: string;
  data_compra: DataISO;
  valor_compra: string;
  data_venda: DataISO | null;
  valor_venda: string | null;
}

// ------------------------------------------------------------------ apoio

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Próximo código da sequência — `V-01`, `V-02`…
 *
 * O número sai do maior já usado, não da contagem de linhas: código de veículo
 * excluído não volta a circular. O lock consultivo segura duas criações
 * simultâneas, que sem ele receberiam o mesmo código e a segunda quebraria na
 * restrição de unicidade.
 */
export async function proximoCodigo(c: PoolClient): Promise<string> {
  await c.query("select pg_advisory_xact_lock(hashtext('codigo_veiculo'))");
  const { rows } = await c.query<{ proximo: number }>(
    `select coalesce(max(substring(codigo from '\\d+')::int), 0) + 1 as proximo from veiculo`);
  return `V-${String(rows[0]!.proximo).padStart(2, "0")}`;
}

async function carregar(c: PoolClient, id: string): Promise<LinhaVeiculo> {
  const { rows } = await c.query<LinhaVeiculo>(
    `select id, codigo, marca, modelo, placa, data_compra, valor_compra, data_venda, valor_venda
       from veiculo where id = $1`, [id]);
  const v = rows[0];
  if (!v) throw new NaoEncontrado("Veículo não encontrado.");
  return v;
}

function validarObrigatorios(e: {
  marca?: string; modelo?: string; placa?: string; dataCompra?: string; valorCompra?: number;
}): void {
  if (!texto(e.marca) || !texto(e.modelo) || !texto(e.placa) ||
      !texto(e.dataCompra) || !e.valorCompra || e.valorCompra <= 0) {
    throw new ErroDeValidacao(MSG.veiculoIncompleto);
  }
}

function validarDatas(dataCompra: DataISO, dataVenda: DataISO | null): void {
  if (dataVenda && dataVenda < dataCompra) {
    throw new ErroDeValidacao(MSG.vendaAntesDaCompra);
  }
}

async function comissoesConfiguradas(c: PoolClient): Promise<readonly Comissao[]> {
  const { rows } = await c.query<{ valor: unknown }>(
    "select valor from config where chave = 'comissoes_padrao'");
  return lerComissoes(rows[0]?.valor);
}

// ------------------------------------------------------------------- criar

export async function criarVeiculo(
  c: PoolClient, e: EntradaVeiculo, usuarioId: string | null,
): Promise<{ id: string; codigo: string }> {
  validarObrigatorios(e);
  const tipo = lerTipo(e.tipo);
  await garantirCatalogo(c, tipo, e.marca, e.modelo, e.cor);

  const codigo = await proximoCodigo(c);
  const placa = texto(e.placa).toUpperCase();

  const { rows } = await c.query<{ id: string }>(
    `insert into veiculo (codigo, tipo, marca, modelo, versao, ano, cor, placa, km,
                          data_compra, valor_compra, valor_anuncio,
                          fipe_compra, fipe_hoje, origem, observacao)
     values ($1,$15,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'compra',$14)
     returning id`,
    [codigo, texto(e.marca), texto(e.modelo), e.versao ?? null, e.ano ?? null,
     texto(e.cor), placa, e.km ?? null, e.dataCompra, paraNumeric(e.valorCompra),
     e.valorAnuncio == null ? null : paraNumeric(e.valorAnuncio),
     e.fipeCompra == null ? null : paraNumeric(e.fipeCompra),
     e.fipeHoje == null ? null : paraNumeric(e.fipeHoje),
     e.observacao ?? null, tipo],
  );
  const id = rows[0]!.id;

  await registrarMovimentoOpcional(c, e.contaId ?? null, {
    data: e.dataCompra,
    descricao: `Compra · ${texto(e.marca)} ${texto(e.modelo)}`,
    tipo: "compra",
    valor: -e.valorCompra,
    veiculoId: id,
  });

  if (e.provisionarComissao !== false) await provisionarComissao(c, id);

  await registrarEvento(c, usuarioId, "veiculo", id, "criou", null, { codigo, placa });
  return { id, codigo };
}

/**
 * Lança a comissão como custo previsto, no momento em que o carro entra.
 *
 * A §3.4 chama isso de provisão: custo sem data, que ainda não aconteceu mas
 * já entra no custo total. E a §4.6 sempre previu esse caminho — o checkbox
 * da venda "vem desmarcado quando o veículo já possui algum custo de
 * categoria Comissão, porque já foram provisionadas na entrada". Até
 * 22/08/2026 nada provisionava; agora todo carro que entra já nasce com ela.
 *
 * O efeito prático é o lucro projetado dizer a verdade desde o primeiro dia:
 * antes ele ignorava R$ 1.500 que sempre iam sair na venda.
 *
 * Sem movimento de caixa, que é o que "previsto" quer dizer: o dinheiro sai
 * quando for pago, pela tela de custo, com a conta escolhida ali.
 */
async function provisionarComissao(c: PoolClient, veiculoId: string): Promise<void> {
  for (const comissao of await comissoesConfiguradas(c)) {
    await c.query(
      `insert into custo (veiculo_id, descricao, categoria, data, valor)
       values ($1, $2, $3, null, $4)`,
      [veiculoId, comissao.beneficiario, CATEGORIA_COMISSAO, paraNumeric(comissao.valor)]);
  }
}

// ------------------------------------------------------------------ editar

/**
 * Edita todos os campos, inclusive data e valor de compra e de venda — §4.8.
 *
 * O que a especificação destaca: "Ao alterar esses valores, atualize os
 * `movimento_caixa` vinculados — senão o extrato passa a contar história
 * diferente da ficha." É isso que a segunda metade da função faz.
 */
export async function editarVeiculo(
  c: PoolClient, id: string, e: Partial<EntradaVeiculo> & {
    dataVenda?: DataISO | null; valorVenda?: Centavos | null;
  }, usuarioId: string | null,
): Promise<void> {
  const { rows: atuais } = await c.query<Record<string, unknown>>(
    "select * from veiculo where id = $1 for update", [id]);
  const atual = atuais[0];
  if (!atual) throw new NaoEncontrado("Veículo não encontrado.");

  const novo = {
    tipo: lerTipo(e.tipo ?? atual["tipo"]),
    marca: e.marca ?? String(atual["marca"]),
    modelo: e.modelo ?? String(atual["modelo"]),
    cor: e.cor ?? String(atual["cor"]),
    placa: (e.placa ?? String(atual["placa"])).toUpperCase(),
    dataCompra: e.dataCompra ?? String(atual["data_compra"]),
    valorCompra: e.valorCompra ?? deNumeric(atual["valor_compra"] as string)!,
    dataVenda: e.dataVenda !== undefined ? e.dataVenda : (atual["data_venda"] as string | null),
    valorVenda: e.valorVenda !== undefined
      ? e.valorVenda
      : deNumeric(atual["valor_venda"] as string | null),
  };

  validarObrigatorios(novo);
  validarDatas(novo.dataCompra, novo.dataVenda);
  // A restrição do banco já garante isto, mas a mensagem daqui é para gente ler.
  if ((novo.dataVenda === null) !== (novo.valorVenda === null)) {
    throw new ErroDeValidacao("Data e valor da venda precisam ser preenchidos juntos.");
  }

  await garantirCatalogo(c, novo.tipo, novo.marca, novo.modelo, novo.cor);

  await c.query(
    `update veiculo set tipo = $17, marca = $2, modelo = $3, versao = $4, ano = $5, cor = $6,
            placa = $7, km = $8, data_compra = $9, valor_compra = $10,
            valor_anuncio = $11, fipe_compra = $12, fipe_hoje = $13,
            data_venda = $14, valor_venda = $15, observacao = $16,
            atualizado_em = now()
      where id = $1`,
    [id, novo.marca, novo.modelo,
     e.versao !== undefined ? e.versao : atual["versao"],
     e.ano !== undefined ? e.ano : atual["ano"],
     novo.cor, novo.placa,
     e.km !== undefined ? e.km : atual["km"],
     novo.dataCompra, paraNumeric(novo.valorCompra),
     e.valorAnuncio !== undefined
       ? (e.valorAnuncio == null ? null : paraNumeric(e.valorAnuncio))
       : atual["valor_anuncio"],
     e.fipeCompra !== undefined
       ? (e.fipeCompra == null ? null : paraNumeric(e.fipeCompra))
       : atual["fipe_compra"],
     e.fipeHoje !== undefined
       ? (e.fipeHoje == null ? null : paraNumeric(e.fipeHoje))
       : atual["fipe_hoje"],
     novo.dataVenda, novo.valorVenda === null ? null : paraNumeric(novo.valorVenda),
     e.observacao !== undefined ? e.observacao : atual["observacao"],
     novo.tipo],
  );

  await sincronizarMovimentos(c, id, novo, e.contaId);

  await registrarEvento(c, usuarioId, "veiculo", id, "editou",
    { valorCompra: atual["valor_compra"], dataCompra: atual["data_compra"],
      valorVenda: atual["valor_venda"], dataVenda: atual["data_venda"] },
    { valorCompra: novo.valorCompra, dataCompra: novo.dataCompra,
      valorVenda: novo.valorVenda, dataVenda: novo.dataVenda });
}

/**
 * Deixa o extrato coerente com a ficha depois de uma edição.
 *
 * Só mexe em movimento que já existe: editar um veículo que foi lançado com
 * "Não descontar do caixa" não inventa movimentação nova, a menos que a edição
 * traga uma conta de propósito.
 */
async function sincronizarMovimentos(
  c: PoolClient,
  id: string,
  novo: { codigo?: string; marca: string; modelo: string; dataCompra: DataISO;
          valorCompra: Centavos; dataVenda: DataISO | null; valorVenda: Centavos | null },
  contaEscolhida: string | null | undefined,
): Promise<void> {
  const { rows: existentes } = await c.query<{ tipo: string; conta_id: string }>(
    `select tipo, conta_id from movimento_caixa
      where veiculo_id = $1 and custo_id is null and tipo in ('compra', 'venda')`,
    [id]);
  const contaDe = (tipo: string) =>
    contaEscolhida ?? existentes.find((m) => m.tipo === tipo)?.conta_id ?? null;

  const { rows: dados } = await c.query<{ codigo: string }>(
    "select codigo from veiculo where id = $1", [id]);
  const codigo = dados[0]!.codigo;

  const contaCompra = contaDe("compra");
  if (contaCompra) {
    await refazerMovimentoDoVeiculo(c, id, "compra", {
      contaId: contaCompra,
      data: novo.dataCompra,
      descricao: `Compra · ${novo.marca} ${novo.modelo}`,
      valor: -novo.valorCompra,
    });
  }

  const contaVenda = contaDe("venda");
  if (contaVenda) {
    // Numa venda com troca, o que entrou em dinheiro é `venda − avaliação`
    // (§4.5). A avaliação mora no veículo que entrou.
    const { rows: entrou } = await c.query<{ avaliacao_troca: string | null }>(
      "select avaliacao_troca from veiculo where troca_de_id = $1", [id]);
    const avaliacao = deNumeric(entrou[0]?.avaliacao_troca ?? null) ?? 0;
    const entrada = novo.valorVenda === null ? null : novo.valorVenda - avaliacao;

    await refazerMovimentoDoVeiculo(c, id, "venda",
      entrada === null || entrada === 0 ? null : {
        contaId: contaVenda,
        data: novo.dataVenda!,
        descricao: `Venda · ${novo.marca} ${novo.modelo}`,
        valor: entrada,
      });
  }
}

// ----------------------------------------------------------------- excluir

export interface PreviaExclusao {
  codigo: string;
  descricao: string;
  custos: { quantidade: number; soma: Centavos };
  movimentos: { quantidade: number; valorDevolvido: Centavos };
  venda: { data: DataISO; valor: Centavos } | null;
  /** Os vínculos de troca, nos dois sentidos. Numa venda pode entrar mais de um. */
  trocas: { id: string; codigo: string; descricao: string; sentido: "entrou" | "saiu" }[];
}

/**
 * O que a confirmação de exclusão precisa dizer — §4.8.
 *
 * "Exige confirmação que lista, com números reais, o que será apagado." Não é
 * um "tem certeza?": é a conta do estrago.
 */
export async function previaExclusao(c: PoolClient, id: string): Promise<PreviaExclusao> {
  const v = await carregar(c, id);

  const { rows: custos } = await c.query<{ n: string; soma: string }>(
    "select count(*) n, coalesce(sum(valor), 0) soma from custo where veiculo_id = $1", [id]);
  const { rows: movimentos } = await c.query<{ n: string; soma: string }>(
    "select count(*) n, coalesce(sum(valor), 0) soma from movimento_caixa where veiculo_id = $1", [id]);

  // Devolver ao saldo é desfazer a soma dos movimentos: uma compra de −58.000
  // devolve +58.000 à conta.
  const valorDevolvido = -deNumeric(movimentos[0]!.soma)!;

  const { rows: entrou } = await c.query<
    { id: string; codigo: string; marca: string; modelo: string }
  >("select id, codigo, marca, modelo from veiculo where troca_de_id = $1 order by codigo", [id]);
  const { rows: saiu } = await c.query<
    { id: string; codigo: string; marca: string; modelo: string }
  >(`select vv.id, vv.codigo, vv.marca, vv.modelo from veiculo v
       join veiculo vv on vv.id = v.troca_de_id where v.id = $1`, [id]);

  const descrever = (x: { marca: string; modelo: string }) => `${x.marca} ${x.modelo}`;
  const trocas = [
    ...entrou.map((x) => ({
      id: x.id, codigo: x.codigo, descricao: descrever(x), sentido: "entrou" as const,
    })),
    ...saiu.map((x) => ({
      id: x.id, codigo: x.codigo, descricao: descrever(x), sentido: "saiu" as const,
    })),
  ];

  return {
    codigo: v.codigo,
    descricao: `${v.marca} ${v.modelo} · ${v.placa}`,
    custos: { quantidade: Number(custos[0]!.n), soma: deNumeric(custos[0]!.soma)! },
    movimentos: { quantidade: Number(movimentos[0]!.n), valorDevolvido },
    venda: v.data_venda ? { data: v.data_venda, valor: deNumeric(v.valor_venda)! } : null,
    trocas,
  };
}

export async function excluirVeiculo(
  c: PoolClient, id: string, usuarioId: string | null,
): Promise<PreviaExclusao> {
  const previa = await previaExclusao(c, id);

  // "O veículo vinculado por troca permanece no sistema, apenas com o vínculo
  // desfeito nos dois sentidos" (§4.8). A origem continua sendo `troca`:
  // desfazer o vínculo não apaga o fato de o carro ter entrado numa troca.
  await c.query("update veiculo set troca_de_id = null where troca_de_id = $1", [id]);

  // Custos e movimentações vão junto por `on delete cascade`.
  await c.query("delete from veiculo where id = $1", [id]);

  await registrarEvento(c, usuarioId, "veiculo", id, "excluiu", previa, null);
  return previa;
}

// ------------------------------------------------------------------- vender

export interface ResultadoVenda {
  lucro: Centavos;
  entradaEmCaixa: Centavos;
  /** `entradaEmCaixa` menos as comissões pagas na hora. */
  liquidoEmCaixa: Centavos;
  /** Soma dos ágios dos veículos recebidos. */
  agio: Centavos;
  veiculosQueEntraram: { id: string; codigo: string }[];
  comissoesLancadas: Comissao[];
}

/**
 * Marca como vendido — e, quando há troca, faz as três coisas da §4.5 numa
 * transação só.
 */
export async function venderVeiculo(
  c: PoolClient, id: string, e: EntradaVenda, usuarioId: string | null,
): Promise<ResultadoVenda> {
  const { rows: travados } = await c.query<LinhaVeiculo>(
    `select id, codigo, marca, modelo, placa, data_compra, valor_compra, data_venda, valor_venda
       from veiculo where id = $1 for update`, [id]);
  const v = travados[0];
  if (!v) throw new NaoEncontrado("Veículo não encontrado.");
  if (v.data_venda) throw new ErroDeValidacao(`${v.codigo} já foi vendido em ${v.data_venda}.`);

  if (!e.valorVenda || e.valorVenda <= 0) {
    throw new ErroDeValidacao("Informe um valor de venda maior que zero.");
  }
  validarDatas(v.data_compra, e.dataVenda);

  await c.query(
    "update veiculo set data_venda = $2, valor_venda = $3, atualizado_em = now() where id = $1",
    [id, e.dataVenda, paraNumeric(e.valorVenda)]);

  // ---------------------------------------------------------------- trocas
  // Pode entrar mais de um veículo: dois carros, ou um carro e uma moto. Cada
  // um vira um veículo independente no estoque, com o seu próprio vínculo com
  // esta venda; o caixa recebe a venda menos a soma das avaliações.
  const recebidos = e.trocas ?? [];
  for (const t of recebidos) {
    if (!t.avaliacao || t.avaliacao <= 0) {
      throw new ErroDeValidacao("Informe a avaliação de cada veículo recebido na troca.");
    }
  }

  const calculo = calcularTrocas(e.valorVenda, recebidos);
  const entradaEmCaixa = calculo.entradaEmCaixa;
  const agio = calculo.agioTotal;
  const veiculosQueEntraram: { id: string; codigo: string }[] = [];

  for (const [i, t] of recebidos.entries()) {
    const entrada = calculo.entradas[i]!;

    validarObrigatorios({
      marca: t.marca, modelo: t.modelo, placa: t.placa,
      dataCompra: e.dataVenda, valorCompra: entrada.valorCompraEntrada,
    });
    const tipoQueEntrou = lerTipo(t.tipo);
    await garantirCatalogo(c, tipoQueEntrou, t.marca, t.modelo, t.cor);

    const codigo = await proximoCodigo(c);
    const { rows } = await c.query<{ id: string }>(
      `insert into veiculo (codigo, tipo, marca, modelo, versao, ano, cor, placa, km,
                            data_compra, valor_compra, valor_anuncio,
                            origem, troca_de_id, avaliacao_troca, mercado_troca)
       values ($1,$15,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'troca',$12,$13,$14)
       returning id`,
      [codigo, texto(t.marca), texto(t.modelo), t.versao ?? null, t.ano ?? null,
       texto(t.cor), texto(t.placa).toUpperCase(), t.km ?? null,
       e.dataVenda, paraNumeric(entrada.valorCompraEntrada),
       t.valorAnuncio == null ? null : paraNumeric(t.valorAnuncio),
       id, paraNumeric(t.avaliacao),
       t.mercado == null ? null : paraNumeric(t.mercado), tipoQueEntrou],
    );
    veiculosQueEntraram.push({ id: rows[0]!.id, codigo });
    // Carro recebido na troca também é carro entrando no pátio, e também vai
    // ser vendido um dia — provisiona igual ao que entra por compra.
    if (t.provisionarComissao !== false) await provisionarComissao(c, rows[0]!.id);

    // Modo "pelo mercado": o ágio vira custo desta venda, porque
    // supervalorizar a troca é desconto disfarçado (§4.5). Um custo por
    // veículo, e não um só somado, para que a linha diga de qual carro veio.
    if (entrada.custoAgioNoVendido > 0) {
      await c.query(
        `insert into custo (veiculo_id, descricao, categoria, data, valor)
         values ($1, $2, 'Troca', $3, $4)`,
        [id, `Ágio na troca do ${codigo} · ${texto(t.marca)} ${texto(t.modelo)}`,
         e.dataVenda, paraNumeric(entrada.custoAgioNoVendido)]);
    }
  }

  // ---------------------------------------------------------------- caixa
  // Zero acontece quando a avaliação da troca cobre a venda inteira: não há
  // dinheiro trocando de mão, e movimento de valor zero seria ruído no extrato.
  if (e.contaId && entradaEmCaixa !== 0) {
    await registrarMovimento(c, {
      contaId: e.contaId,
      data: e.dataVenda,
      descricao: `Venda · ${v.marca} ${v.modelo}`,
      tipo: "venda",
      valor: entradaEmCaixa,
      veiculoId: id,
    });
  }

  // ------------------------------------------------------------ comissões
  // Entram como custo e, quando a venda caiu numa conta, saem dela na mesma
  // hora. Vender o Ka por 40.000 com 1.500 de comissão deixa 38.500 na conta,
  // que é o que de fato sobra — marcar o checkbox na venda é dizer que a
  // comissão foi paga ali, não que ficou provisionada.
  //
  // São duas linhas no extrato, não uma entrada líquida: a venda foi de
  // 40.000 e a comissão foi de 1.500, e o extrato conta as duas coisas. Além
  // disso o movimento fica preso ao custo, então apagar a comissão devolve o
  // dinheiro pela máquina que já existe.
  //
  // Sem conta na venda ("Não descontar do caixa"), a comissão também não sai
  // de lugar nenhum: vira a provisão da §3.4, paga depois pela tela de custo.
  // Provisão pendente é o caso normal desde que todo carro nasce com uma:
  // pagar é datá-la e tirar o dinheiro, não criar outra. Criar uma segunda
  // cobraria o mesmo carro duas vezes.
  const { rows: provisionadas } = await c.query<{ id: string; descricao: string; valor: string }>(
    `select id, descricao, valor from custo
      where veiculo_id = $1 and categoria = $2 and data is null
      order by descricao`, [id, CATEGORIA_COMISSAO]);

  const { rows: pagas } = await c.query<{ n: string }>(
    `select count(*) n from custo
      where veiculo_id = $1 and categoria = $2 and data is not null`, [id, CATEGORIA_COMISSAO]);

  const padrao = marcarComissoesPorPadrao(Number(pagas[0]!.n) > 0);
  const lancar = e.lancarComissoes ?? padrao;

  const comissoesLancadas: Comissao[] = [];
  let comissaoNoCaixa = 0;

  if (lancar) {
    // Quando há provisão, ela é que é paga. Só sem provisão nenhuma é que a
    // venda cria a comissão do zero — carro anterior à provisão automática,
    // ou aquele em que alguém apagou a provisão de propósito.
    const aPagar = provisionadas.length > 0
      ? provisionadas.map((p) => ({
          id: p.id, beneficiario: p.descricao, valor: deNumeric(p.valor)!,
        }))
      : await Promise.all((await comissoesConfiguradas(c)).map(async (comissao) => {
          const { rows } = await c.query<{ id: string }>(
            `insert into custo (veiculo_id, descricao, categoria, data, valor)
             values ($1, $2, $3, null, $4) returning id`,
            [id, comissao.beneficiario, CATEGORIA_COMISSAO, paraNumeric(comissao.valor)]);
          return { id: rows[0]!.id, beneficiario: comissao.beneficiario, valor: comissao.valor };
        }));

    for (const comissao of aPagar) {
      await c.query("update custo set data = $2 where id = $1", [comissao.id, e.dataVenda]);

      await registrarMovimentoOpcional(c, e.contaId ?? null, {
        data: e.dataVenda,
        descricao: `${comissao.beneficiario} · ${v.marca} ${v.modelo}`,
        tipo: "custo",
        valor: -comissao.valor,
        veiculoId: id,
        custoId: comissao.id,
      });

      comissoesLancadas.push({ beneficiario: comissao.beneficiario, valor: comissao.valor });
      if (e.contaId) comissaoNoCaixa += comissao.valor;
    }
  }

  const { rows: totais } = await c.query<{ custo_total: string }>(
    "select custo_total from custo_veiculo where veiculo_id = $1", [id]);
  const lucroApurado = e.valorVenda - deNumeric(totais[0]!.custo_total)!;

  await registrarEvento(c, usuarioId, "veiculo", id, "vendeu", null, {
    dataVenda: e.dataVenda, valorVenda: e.valorVenda,
    trocas: veiculosQueEntraram.map((x) => x.codigo),
  });

  return {
    lucro: lucroApurado,
    entradaEmCaixa,
    /** O que sobrou na conta depois da comissão — o número que a tela mostra. */
    liquidoEmCaixa: entradaEmCaixa - comissaoNoCaixa,
    agio, veiculosQueEntraram, comissoesLancadas,
  };
}

// ------------------------------------------------------------ desfazer venda

export interface PreviaDesfazerVenda {
  codigo: string;
  descricao: string;
  venda: { data: DataISO; valor: Centavos };
  /**
   * O efeito líquido no caixa, conta por conta. `valor` é o que sai: a entrada
   * da venda menos as comissões que também somem, porque as duas coisas
   * desaparecem juntas.
   */
  caixa: { conta: string; valor: Centavos; saldoAtual: Centavos; cabe: boolean }[];
  /** Comissões pagas no dia da venda. Voltam a ser provisão, não somem. */
  comissoes: { quantidade: number; soma: Centavos };
  /** O ágio da troca, quando o modo "pelo mercado" o lançou como custo. */
  agioTroca: { quantidade: number; soma: Centavos };
  /** Preenchido quando a venda não pode ser desfeita, com o motivo. */
  impedimento: string | null;
}

/**
 * O que desfazer a venda vai mexer — a mesma ideia da §4.8 aplicada aqui.
 *
 * Desfazer não é editar: devolve o carro ao pátio, tira dinheiro do caixa e
 * apaga custos que a venda criou. Quem confirma precisa ver a conta antes.
 */
export async function previaDesfazerVenda(
  c: PoolClient, id: string,
): Promise<PreviaDesfazerVenda> {
  const v = await carregar(c, id);
  if (!v.data_venda) throw new ErroDeValidacao(MSG.vendaJaDesfeita);

  // Todo movimento que some ao desfazer, somado por conta.
  //
  // Não é só a entrada da venda: a comissão sai da mesma conta na hora da
  // venda, e desfazer apaga o custo dela — o que leva o movimento junto e
  // devolve o dinheiro. Contar só a venda faria a prévia recusar um desfazer
  // que cabe: numa venda de 40.000 com 1.500 de comissão, o que sai da conta
  // são 38.500, e é esse o número que precisa caber.
  const { rows: movimentos } = await c.query<
    { conta: string; sai: string; saldo: string }
  >(`select ct.nome as conta, sum(m.valor) as sai, min(s.saldo) as saldo
       from movimento_caixa m
       join conta ct on ct.id = m.conta_id
       join saldo_conta s on s.conta_id = m.conta_id
      where m.veiculo_id = $1
        and (
          (m.tipo = 'venda' and m.custo_id is null)
          or m.custo_id in (
            select k.id from custo k
             where k.veiculo_id = $1 and k.data = $2
               and k.categoria in ($3, 'Troca')
          )
        )
      group by ct.nome
     having sum(m.valor) <> 0`, [id, v.data_venda, CATEGORIA_COMISSAO]);

  // Comissão e ágio da troca nascem na venda, com a data dela. Custo de
  // comissão com outra data foi provisionado antes e não é nosso para apagar.
  const { rows: comissoes } = await c.query<{ n: string; soma: string }>(
    `select count(*) n, coalesce(sum(valor), 0) soma from custo
      where veiculo_id = $1 and categoria = $2 and data = $3`,
    [id, CATEGORIA_COMISSAO, v.data_venda]);

  const { rows: agio } = await c.query<{ n: string; soma: string }>(
    `select count(*) n, coalesce(sum(valor), 0) soma from custo
      where veiculo_id = $1 and categoria = 'Troca' and data = $2`,
    [id, v.data_venda]);

  const { rows: entrou } = await c.query<{ codigo: string; marca: string; modelo: string }>(
    "select codigo, marca, modelo from veiculo where troca_de_id = $1 order by codigo", [id]);

  const caixa = movimentos.map((m) => {
    const valor = deNumeric(m.sai)!;
    const saldoAtual = deNumeric(m.saldo)!;
    return { conta: m.conta, valor, saldoAtual, cabe: saldoAtual - valor >= 0 };
  });

  const semSaldo = caixa.find((k) => !k.cabe);
  const impedimento = entrou.length
    ? trocaImpedeDesfazer(
        entrou.map((x) => ({ codigo: x.codigo, descricao: `${x.marca} ${x.modelo}` })))
    : semSaldo
      ? saldoNaoDevolveVenda(semSaldo.conta, semSaldo.saldoAtual, semSaldo.valor)
      : null;

  return {
    codigo: v.codigo,
    descricao: `${v.marca} ${v.modelo} · ${v.placa}`,
    venda: { data: v.data_venda, valor: deNumeric(v.valor_venda)! },
    caixa,
    comissoes: { quantidade: Number(comissoes[0]!.n), soma: deNumeric(comissoes[0]!.soma)! },
    agioTroca: { quantidade: Number(agio[0]!.n), soma: deNumeric(agio[0]!.soma)! },
    impedimento,
  };
}

/**
 * Devolve o carro ao pátio, desfazendo o que a venda fez.
 *
 * Apaga exatamente o que `venderVeiculo` criou: a entrada no caixa, as
 * comissões daquele dia e o ágio da troca. Não toca em custo anterior à
 * venda — o carro volta ao pátio com a preparação que já tinha.
 *
 * Recusa quando entrou um carro na troca. Apagar a venda deixaria esse carro
 * no estoque sem a origem que o explica, e apagá-lo junto seria decidir pelo
 * dono de um veículo que talvez já tenha custo lançado. Quem escolhe é ele.
 */
export async function desfazerVenda(
  c: PoolClient, id: string, usuarioId: string | null,
): Promise<PreviaDesfazerVenda> {
  await c.query("select id from veiculo where id = $1 for update", [id]);
  const previa = await previaDesfazerVenda(c, id);
  if (previa.impedimento) throw new ErroDeValidacao(previa.impedimento);

  await c.query(
    "delete from movimento_caixa where veiculo_id = $1 and tipo = 'venda' and custo_id is null",
    [id]);

  // A comissão **volta a ser provisão**, não some: desde 22/08/2026 ela nasce
  // com o carro, e a venda apenas a paga. Apagá-la devolveria o carro ao pátio
  // sem a provisão que todo carro em pátio tem — e, se a venda a tivesse
  // criado do zero, deixá-la provisionada é o mesmo estado de qualquer outro
  // carro parado. Nos dois caminhos, provisionada é o certo.
  //
  // O movimento sai primeiro e explicitamente: sem `delete from custo`, o
  // `on delete cascade` não tem o que levar junto, e o dinheiro precisa
  // voltar à conta.
  await c.query(
    `delete from movimento_caixa
      where custo_id in (select id from custo
                          where veiculo_id = $1 and categoria = $2 and data = $3)`,
    [id, CATEGORIA_COMISSAO, previa.venda.data]);
  await c.query(
    "update custo set data = null where veiculo_id = $1 and categoria = $2 and data = $3",
    [id, CATEGORIA_COMISSAO, previa.venda.data]);
  await c.query(
    "delete from custo where veiculo_id = $1 and categoria = 'Troca' and data = $2",
    [id, previa.venda.data]);

  await c.query(
    `update veiculo set data_venda = null, valor_venda = null,
            avaliacao_troca = null, mercado_troca = null, atualizado_em = now()
      where id = $1`, [id]);

  await registrarEvento(c, usuarioId, "veiculo", id, "desfez a venda", previa.venda, null);
  return previa;
}
