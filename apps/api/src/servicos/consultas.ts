/**
 * O lado de leitura: as fórmulas da §4 aplicadas às linhas do banco.
 *
 * Tudo é calculado aqui, no backend, como manda a §10 item 3. O frontend
 * recebe número pronto — assim painel, ficha, tabela e API nunca divergem, que
 * é o problema que a planilha tinha.
 *
 * Dinheiro sai em centavos inteiros; percentual e dias saem como número comum.
 */

import type { PoolClient } from "pg";
import { deNumeric, type Centavos } from "../dominio/dinheiro.js";
import {
  cicloDias, custoTotal, faixaIdade, garantia, lucro, lucroProjetado,
  preenchimentoIdade, retornoMes, retornoPct, depreciacao, depreciacaoPct,
  anuncioVsFipe, patrimonio, CORES_FAIXA, DIAS_GARANTIA,
  type DataISO, type FaixaIdade, type Garantia,
} from "../dominio/veiculo.js";
import { NaoEncontrado } from "../dominio/mensagens.js";
import { algumFiltroAtivo, passaNosFiltros, SEM_FILTRO, type Filtros } from "../dominio/filtros.js";

export interface VeiculoCalculado {
  id: string;
  codigo: string;
  marca: string;
  modelo: string;
  versao: string | null;
  ano: number | null;
  cor: string;
  placa: string;
  km: number | null;
  origem: "compra" | "troca";
  observacao: string | null;

  dataCompra: DataISO;
  valorCompra: Centavos;
  valorAnuncio: Centavos | null;
  fipeCompra: Centavos | null;
  fipeHoje: Centavos | null;
  dataVenda: DataISO | null;
  valorVenda: Centavos | null;

  lancamentos: number;
  custoPreparacao: Centavos;
  custoTotal: Centavos;

  vendido: boolean;
  cicloDias: number;
  faixa: FaixaIdade;
  corFaixa: string;
  preenchimentoIdade: number;

  lucro: Centavos | null;
  retornoPct: number | null;
  retornoMes: number | null;
  lucroProjetado: Centavos | null;
  projetadoPct: number | null;
  /** §6.3: anúncio abaixo do custo não tem negociação possível que não seja prejuízo. */
  anuncioAbaixoDoCusto: boolean;

  depreciacao: Centavos | null;
  depreciacaoPct: number | null;
  anuncioVsFipe: number | null;

  garantia: Garantia | null;
}

interface Linha {
  id: string; codigo: string; marca: string; modelo: string; versao: string | null;
  ano: number | null; cor: string; placa: string; km: number | null;
  origem: "compra" | "troca"; observacao: string | null;
  data_compra: DataISO; valor_compra: string; valor_anuncio: string | null;
  fipe_compra: string | null; fipe_hoje: string | null;
  data_venda: DataISO | null; valor_venda: string | null;
  custo_preparacao: string; lancamentos: string;
}

const SELECT_VEICULO = `
  select v.id, v.codigo, v.marca, v.modelo, v.versao, v.ano, v.cor, v.placa, v.km,
         v.origem, v.observacao, v.data_compra, v.valor_compra, v.valor_anuncio,
         v.fipe_compra, v.fipe_hoje, v.data_venda, v.valor_venda,
         cv.custo_preparacao, cv.lancamentos
    from veiculo v
    join custo_veiculo cv on cv.veiculo_id = v.id`;

/** Aplica a §4 inteira a uma linha do banco. */
export function calcular(l: Linha, hoje: DataISO): VeiculoCalculado {
  const valorCompra = deNumeric(l.valor_compra)!;
  const custoPreparacao = deNumeric(l.custo_preparacao)!;
  const total = custoTotal(valorCompra, custoPreparacao);
  const valorVenda = deNumeric(l.valor_venda);
  const valorAnuncio = deNumeric(l.valor_anuncio);
  const fipeCompra = deNumeric(l.fipe_compra);
  const fipeHoje = deNumeric(l.fipe_hoje);

  const ciclo = cicloDias(l.data_compra, l.data_venda, hoje);
  const resultado = valorVenda === null ? null : lucro(valorVenda, total);
  const pct = resultado === null ? null : retornoPct(resultado, total);
  const projetado = lucroProjetado(valorAnuncio, total);

  return {
    id: l.id, codigo: l.codigo, marca: l.marca, modelo: l.modelo, versao: l.versao,
    ano: l.ano, cor: l.cor, placa: l.placa, km: l.km, origem: l.origem,
    observacao: l.observacao,

    dataCompra: l.data_compra, valorCompra, valorAnuncio, fipeCompra, fipeHoje,
    dataVenda: l.data_venda, valorVenda,

    lancamentos: Number(l.lancamentos),
    custoPreparacao,
    custoTotal: total,

    vendido: l.data_venda !== null,
    cicloDias: ciclo,
    faixa: faixaIdade(ciclo),
    corFaixa: CORES_FAIXA[faixaIdade(ciclo)],
    preenchimentoIdade: preenchimentoIdade(ciclo),

    lucro: resultado,
    retornoPct: pct,
    retornoMes: pct === null ? null : retornoMes(pct, ciclo),
    lucroProjetado: projetado,
    projetadoPct: projetado === null ? null : retornoPct(projetado, total),
    anuncioAbaixoDoCusto: valorAnuncio !== null && valorAnuncio <= total,

    depreciacao: depreciacao(fipeCompra, fipeHoje),
    depreciacaoPct: depreciacaoPct(fipeCompra, fipeHoje),
    anuncioVsFipe: anuncioVsFipe(valorAnuncio, fipeHoje),

    garantia: l.data_venda === null ? null : garantia(l.data_venda, hoje),
  };
}

export type Situacao = "estoque" | "vendido" | "todos";

/**
 * A listagem é o único lugar que aplica os filtros da §6.1 — painel e vendas
 * saem daqui e herdam o recorte, em vez de cada um filtrar do seu jeito.
 */
export async function listarVeiculos(
  c: PoolClient, situacao: Situacao, hoje: DataISO, filtros: Filtros = SEM_FILTRO,
): Promise<VeiculoCalculado[]> {
  const filtro = situacao === "estoque" ? "where v.data_venda is null"
    : situacao === "vendido" ? "where v.data_venda is not null"
    : "";
  const { rows } = await c.query<Linha>(`${SELECT_VEICULO} ${filtro}`);
  const calculados = rows
    .map((l) => calcular(l, hoje))
    .filter((v) => passaNosFiltros(v, filtros, hoje));

  // §6.3: estoque ordenado por dias em pátio, decrescente. Vendidos, pela
  // venda mais recente — é o que a tela de Vendas mostra primeiro.
  return situacao === "vendido"
    ? calculados.sort((a, b) => (b.dataVenda ?? "").localeCompare(a.dataVenda ?? ""))
    : calculados.sort((a, b) => b.cicloDias - a.cicloDias);
}

// -------------------------------------------------------------- ficha (§6.5)

export interface Custo {
  id: string;
  descricao: string;
  categoria: string;
  data: DataISO | null;
  /** Custo previsto (§3.4): aparece na interface como "prevista". */
  prevista: boolean;
  valor: Centavos;
}

export interface Ficha extends VeiculoCalculado {
  custos: Custo[];
  custoPorCategoria: { categoria: string; valor: Centavos }[];
  troca: {
    entrou: { id: string; codigo: string; descricao: string } | null;
    saiu: { id: string; codigo: string; descricao: string } | null;
    avaliacao: Centavos | null;
    mercado: Centavos | null;
    agio: Centavos | null;
  };
  movimentos: { id: string; data: DataISO; descricao: string; tipo: string; conta: string; valor: Centavos }[];
}

export async function ficha(c: PoolClient, id: string, hoje: DataISO): Promise<Ficha> {
  const { rows } = await c.query<Linha>(`${SELECT_VEICULO} where v.id = $1`, [id]);
  const linha = rows[0];
  if (!linha) throw new NaoEncontrado("Veículo não encontrado.");

  // Em série, e não em Promise.all: um PoolClient atende uma consulta por vez,
  // e paralelizar nele só enfileira com um aviso de depreciação de brinde.
  const custos = await c.query<
    { id: string; descricao: string; categoria: string; data: DataISO | null; valor: string }
  >(`select id, descricao, categoria, data, valor from custo
      where veiculo_id = $1 order by data nulls last, criado_em`, [id]);

  const entrou = await c.query<{ id: string; codigo: string; marca: string; modelo: string }>(
    "select id, codigo, marca, modelo from veiculo where troca_de_id = $1", [id]);

  const saiu = await c.query<{ id: string; codigo: string; marca: string; modelo: string }>(
    `select vv.id, vv.codigo, vv.marca, vv.modelo from veiculo v
       join veiculo vv on vv.id = v.troca_de_id where v.id = $1`, [id]);

  const meus = await c.query<{ avaliacao_troca: string | null; mercado_troca: string | null }>(
    "select avaliacao_troca, mercado_troca from veiculo where id = $1", [id]);

  const movimentos = await c.query<
    { id: string; data: DataISO; descricao: string; tipo: string; conta: string; valor: string }
  >(`select m.id, m.data, m.descricao, m.tipo, ct.nome as conta, m.valor
       from movimento_caixa m join conta ct on ct.id = m.conta_id
      where m.veiculo_id = $1 order by m.data, m.criado_em`, [id]);

  const porCategoria = new Map<string, Centavos>();
  for (const custo of custos.rows) {
    const valor = deNumeric(custo.valor)!;
    porCategoria.set(custo.categoria, (porCategoria.get(custo.categoria) ?? 0) + valor);
  }

  // Ágio existe no carro que ENTROU pela troca; no que saiu, a avaliação está
  // do outro lado do vínculo. Ver a regra de sentido único da §3.3.
  const avaliacao = deNumeric(meus.rows[0]?.avaliacao_troca ?? null);
  const mercado = deNumeric(meus.rows[0]?.mercado_troca ?? null);
  const nome = (v: { codigo: string; marca: string; modelo: string }) =>
    `${v.marca} ${v.modelo}`;

  return {
    ...calcular(linha, hoje),
    custos: custos.rows.map((k) => ({
      id: k.id, descricao: k.descricao, categoria: k.categoria,
      data: k.data, prevista: k.data === null, valor: deNumeric(k.valor)!,
    })),
    custoPorCategoria: [...porCategoria.entries()]
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
    troca: {
      entrou: entrou.rows[0]
        ? { id: entrou.rows[0].id, codigo: entrou.rows[0].codigo, descricao: nome(entrou.rows[0]) }
        : null,
      saiu: saiu.rows[0]
        ? { id: saiu.rows[0].id, codigo: saiu.rows[0].codigo, descricao: nome(saiu.rows[0]) }
        : null,
      avaliacao,
      mercado,
      agio: avaliacao === null || mercado === null ? null : Math.max(0, avaliacao - mercado),
    },
    movimentos: movimentos.rows.map((m) => ({ ...m, valor: deNumeric(m.valor)! })),
  };
}

// ------------------------------------------------------------ vendas (§6.4)

export interface ConsolidadoVendas {
  vendidos: number;
  investido: Centavos;
  faturado: Centavos;
  lucro: Centavos;
  retornoPct: number;
  cicloMedio: number;
  lucroMedio: Centavos;
  custoGarantia: Centavos;
  emGarantia: number;
}

export async function consolidadoVendas(
  c: PoolClient, hoje: DataISO, filtros: Filtros = SEM_FILTRO,
): Promise<{ consolidado: ConsolidadoVendas; veiculos: VeiculoCalculado[] }> {
  const veiculos = await listarVeiculos(c, "vendido", hoje, filtros);

  const investido = veiculos.reduce((a, v) => a + v.custoTotal, 0);
  const faturado = veiculos.reduce((a, v) => a + (v.valorVenda ?? 0), 0);
  const resultado = faturado - investido;

  // O custo de garantia acompanha o recorte: são os `Retorno` dos carros que
  // sobraram no filtro, não os do sistema inteiro.
  const { rows: garantias } = await c.query<{ soma: string }>(
    `select coalesce(sum(valor), 0) soma from custo
      where categoria = 'Retorno' and veiculo_id = any($1::uuid[])`,
    [veiculos.map((v) => v.id)]);

  return {
    consolidado: {
      vendidos: veiculos.length,
      investido,
      faturado,
      lucro: resultado,
      retornoPct: retornoPct(resultado, investido),
      cicloMedio: veiculos.length
        ? Math.round(veiculos.reduce((a, v) => a + v.cicloDias, 0) / veiculos.length) : 0,
      lucroMedio: veiculos.length ? Math.round(resultado / veiculos.length) : 0,
      custoGarantia: deNumeric(garantias[0]!.soma)!,
      emGarantia: veiculos.filter((v) => v.garantia?.ativa).length,
    },
    veiculos,
  };
}

// ------------------------------------------------------------ painel (§6.2)

export interface Painel {
  /**
   * Há filtro da §6.1 em vigor?
   *
   * Importa porque o caixa **não** é filtrado: dinheiro em conta não tem marca
   * nem faixa de preço. Com recorte ativo, o patrimônio mistura um caixa
   * inteiro com um estoque parcial, e a tela precisa dizer isso.
   */
  recorteAtivo: boolean;
  patrimonio: ReturnType<typeof patrimonio>;
  indicadores: {
    emEstoque: number;
    capitalImobilizado: Centavos;
    giroMedio: number;
    retornoMedio: number;
    lucroRealizado: Centavos;
    parados90: number;
    emGarantia: number;
  };
  graficos: {
    envelhecimento: { faixa: FaixaIdade; cor: string; quantidade: number }[];
    resultadoPorMes: { mes: string; lucro: Centavos; quantidade: number }[];
    retornoPorCiclo: { codigo: string; ciclo: number; retorno: number }[];
    custoPorCategoria: { categoria: string; valor: Centavos }[];
    anuncioVsFipe: { codigo: string; anuncio: Centavos; fipe: Centavos; variacao: number }[];
    retornoPorMarca: { marca: string; retorno: number; vendidos: number }[];
  };
}

export async function painel(
  c: PoolClient, hoje: DataISO, filtros: Filtros = SEM_FILTRO,
): Promise<Painel> {
  const todos = await listarVeiculos(c, "todos", hoje, filtros);
  const estoque = todos.filter((v) => !v.vendido);
  const vendidos = todos.filter((v) => v.vendido);

  const { rows: contas } = await c.query<{ saldo: string }>("select saldo from saldo_conta");
  const caixaTotal = contas.reduce((a, k) => a + deNumeric(k.saldo)!, 0);

  const pat = patrimonio(caixaTotal,
    estoque.map((v) => ({ custoTotal: v.custoTotal, valorAnuncio: v.valorAnuncio })));

  const lucroRealizado = vendidos.reduce((a, v) => a + (v.lucro ?? 0), 0);
  const investidoVendidos = vendidos.reduce((a, v) => a + v.custoTotal, 0);

  // Resultado por mês, pela data da venda.
  const porMes = new Map<string, { lucro: Centavos; quantidade: number }>();
  for (const v of vendidos) {
    const mes = v.dataVenda!.slice(0, 7);
    const atual = porMes.get(mes) ?? { lucro: 0, quantidade: 0 };
    porMes.set(mes, { lucro: atual.lucro + (v.lucro ?? 0), quantidade: atual.quantidade + 1 });
  }

  const { rows: categorias } = await c.query<{ categoria: string; soma: string }>(
    `select categoria, sum(valor) soma from custo
      where veiculo_id = any($1::uuid[])
      group by categoria order by sum(valor) desc limit 10`,
    [todos.map((v) => v.id)]);

  const porMarca = new Map<string, { lucro: Centavos; custo: Centavos; n: number }>();
  for (const v of vendidos) {
    const atual = porMarca.get(v.marca) ?? { lucro: 0, custo: 0, n: 0 };
    porMarca.set(v.marca, {
      lucro: atual.lucro + (v.lucro ?? 0),
      custo: atual.custo + v.custoTotal,
      n: atual.n + 1,
    });
  }

  const faixas: FaixaIdade[] = ["0-30", "31-60", "61-90", "90+"];

  return {
    recorteAtivo: algumFiltroAtivo(filtros),
    patrimonio: pat,
    indicadores: {
      emEstoque: estoque.length,
      capitalImobilizado: pat.estoqueCusto,
      giroMedio: vendidos.length
        ? Math.round(vendidos.reduce((a, v) => a + v.cicloDias, 0) / vendidos.length) : 0,
      retornoMedio: retornoPct(lucroRealizado, investidoVendidos),
      lucroRealizado,
      parados90: estoque.filter((v) => v.cicloDias > 90).length,
      emGarantia: vendidos.filter((v) => v.garantia?.ativa).length,
    },
    graficos: {
      envelhecimento: faixas.map((faixa) => ({
        faixa, cor: CORES_FAIXA[faixa],
        quantidade: estoque.filter((v) => v.faixa === faixa).length,
      })),
      resultadoPorMes: [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, d]) => ({ mes, ...d })),
      retornoPorCiclo: vendidos.map((v) => ({
        codigo: v.codigo, ciclo: v.cicloDias, retorno: v.retornoPct ?? 0,
      })),
      custoPorCategoria: categorias.map((k) => ({
        categoria: k.categoria, valor: deNumeric(k.soma)!,
      })),
      anuncioVsFipe: todos
        .filter((v) => v.valorAnuncio !== null && v.fipeHoje !== null)
        .map((v) => ({
          codigo: v.codigo, anuncio: v.valorAnuncio!, fipe: v.fipeHoje!,
          variacao: v.anuncioVsFipe!,
        })),
      retornoPorMarca: [...porMarca.entries()]
        .map(([marca, d]) => ({ marca, retorno: retornoPct(d.lucro, d.custo), vendidos: d.n }))
        .sort((a, b) => b.retorno - a.retorno),
    },
  };
}

// ------------------------------------------------------------- caixa (§6.6)

export interface VisaoCaixa {
  contas: { id: string; nome: string; tipo: string; saldo: Centavos }[];
  total: Centavos;
  capitalPorSocio: {
    socioId: string; nome: string; aportes: Centavos; retiradas: Centavos; capital: Centavos;
  }[];
  extrato: {
    id: string; data: DataISO; descricao: string; tipo: string;
    conta: string; valor: Centavos; veiculo: string | null;
  }[];
}

export async function visaoCaixa(c: PoolClient, limiteExtrato = 200): Promise<VisaoCaixa> {
  const contas = await c.query<{ conta_id: string; nome: string; tipo: string; saldo: string }>(
    "select conta_id, nome, tipo, saldo from saldo_conta order by tipo desc, nome");

  const capital = await c.query<
    { socio_id: string; nome: string; aportes: string; retiradas: string; capital: string }
  >("select socio_id, nome, aportes, retiradas, capital from capital_socio order by nome");

  const extrato = await c.query<{
    id: string; data: DataISO; descricao: string; tipo: string;
    conta: string; valor: string; veiculo: string | null;
  }>(
    `select m.id, m.data, m.descricao, m.tipo, ct.nome as conta, m.valor, v.codigo as veiculo
       from movimento_caixa m
       join conta ct on ct.id = m.conta_id
       left join veiculo v on v.id = m.veiculo_id
      order by m.data desc, m.criado_em desc
      limit $1`, [limiteExtrato]);

  const linhas = contas.rows.map((k) => ({
    id: k.conta_id, nome: k.nome, tipo: k.tipo, saldo: deNumeric(k.saldo)!,
  }));

  return {
    contas: linhas,
    total: linhas.reduce((a, k) => a + k.saldo, 0),
    capitalPorSocio: capital.rows.map((s) => ({
      socioId: s.socio_id, nome: s.nome,
      aportes: deNumeric(s.aportes)!, retiradas: deNumeric(s.retiradas)!,
      capital: deNumeric(s.capital)!,
    })),
    extrato: extrato.rows.map((m) => ({ ...m, valor: deNumeric(m.valor)! })),
  };
}

export { DIAS_GARANTIA };
