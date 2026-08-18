/**
 * Cliente da API.
 *
 * Um lugar só sabe montar requisição, e é este. A sessão vai no cookie
 * `HttpOnly`, então não há token para guardar nem para vazar — o navegador
 * cuida disso sozinho e o JavaScript nunca vê o segredo.
 *
 * Erro de regra de negócio (422) vira `ErroApi` com a mensagem da §8 pronta
 * para ser exibida como está. Nenhuma tela reescreve mensagem de validação.
 */

import type { Centavos } from "./formato.js";

export class ErroApi extends Error {
  constructor(mensagem: string, readonly status: number) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      ...(corpo === undefined ? {} : {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      }),
    });
  } catch {
    throw new ErroApi("Sem conexão com o servidor.", 0);
  }

  if (resposta.status === 204) return undefined as T;

  const dados = await resposta.json().catch(() => null) as { erro?: string } | null;
  if (!resposta.ok) {
    throw new ErroApi(dados?.erro ?? "Não foi possível concluir.", resposta.status);
  }
  return dados as T;
}

// ------------------------------------------------------------------- tipos

export interface Usuario {
  id: string; nome: string; email: string; papel: "master" | "vendedor"; ativo: boolean;
}

export interface Garantia {
  fim: string; diasRestantes: number; ativa: boolean; preenchimento: number;
}

export type TipoVeiculo = "carro" | "moto" | "outro";

export interface Veiculo {
  id: string; codigo: string;
  tipo: TipoVeiculo;
  /** "moto", "outro" — nulo em carro, que dispensa etiqueta. */
  etiqueta: string | null;
  marca: string; modelo: string; versao: string | null;
  ano: number | null; cor: string; placa: string; km: number | null;
  origem: "compra" | "troca"; observacao: string | null;

  dataCompra: string; valorCompra: Centavos; valorAnuncio: Centavos | null;
  fipeCompra: Centavos | null; fipeHoje: Centavos | null;
  dataVenda: string | null; valorVenda: Centavos | null;

  lancamentos: number; custoPreparacao: Centavos; custoTotal: Centavos;

  vendido: boolean; cicloDias: number;
  faixa: "0-30" | "31-60" | "61-90" | "90+"; corFaixa: string; preenchimentoIdade: number;

  lucro: Centavos | null; retornoPct: number | null; retornoMes: number | null;
  lucroProjetado: Centavos | null; projetadoPct: number | null;
  /** Quanto se cedeu do preço pedido ao fechar. Negativo é desconto. */
  descontoFechamento: Centavos | null;
  anuncioAbaixoDoCusto: boolean;

  depreciacao: Centavos | null; depreciacaoPct: number | null; anuncioVsFipe: number | null;
  garantia: Garantia | null;
}

export interface Custo {
  id: string; descricao: string; categoria: string;
  data: string | null; prevista: boolean; valor: Centavos;
  /** O que volta para o caixa se este custo for excluído. Zero se não saiu de conta. */
  devolveAoCaixa: Centavos;
}

export interface EloDaTroca {
  id: string; codigo: string; descricao: string;
  /** 1 = entrou direto nesta venda; 2 = entrou na venda desse; e assim por diante. */
  nivel: number;
  veioDe: string;
  avaliacao: Centavos | null;
  custoTotal: Centavos;
  vendido: boolean;
  dataVenda: string | null;
  valorVenda: Centavos | null;
  lucro: Centavos | null;
  cicloDias: number;
}

export interface Desdobramento {
  elos: EloDaTroca[];
  vendidos: number;
  emEstoque: number;
  lucroRealizado: Centavos;
  custoEmEstoque: Centavos;
}

export interface Ficha extends Veiculo {
  custos: Custo[];
  /** A data do último custo já pago; previsto não conta. */
  ultimoCusto: string | null;
  /** O que aconteceu com o que entrou na troca. Fora das contas do veículo. */
  desdobramento: Desdobramento;
  custoPorCategoria: { categoria: string; valor: Centavos }[];
  troca: {
    /** Os veículos que entraram nesta venda. Pode ser mais de um. */
    entraram: { id: string; codigo: string; descricao: string; avaliacao: Centavos | null }[];
    saiu: { id: string; codigo: string; descricao: string } | null;
    avaliacao: Centavos | null; mercado: Centavos | null; agio: Centavos | null;
  };
  movimentos: { id: string; data: string; descricao: string; tipo: string; conta: string; valor: Centavos }[];
}

export interface Painel {
  /** Há filtro em vigor? O caixa não é filtrado, e a tela precisa avisar. */
  recorteAtivo: boolean;
  patrimonio: {
    caixaTotal: Centavos; estoqueCusto: Centavos; estoqueAnuncio: Centavos;
    patrimonioTotal: Centavos; lucroNaoRealizado: Centavos; patrimonioFuturo: Centavos;
  };
  indicadores: {
    emEstoque: number; capitalImobilizado: Centavos; giroMedio: number;
    retornoMedio: number; lucroRealizado: Centavos; parados90: number; emGarantia: number;
  };
  graficos: {
    envelhecimento: { faixa: string; cor: string; quantidade: number }[];
    resultadoPorMes: { mes: string; lucro: Centavos; quantidade: number }[];
    retornoPorCiclo: { codigo: string; descricao: string; ciclo: number; retorno: number }[];
    custoPorCategoria: { categoria: string; valor: Centavos }[];
    anuncioVsFipe: {
      codigo: string; descricao: string; anuncio: Centavos; fipe: Centavos; variacao: number;
    }[];
    retornoPorMarca: { marca: string; retorno: number; vendidos: number }[];
  };
}

export interface Vendas {
  consolidado: {
    vendidos: number; compra: Centavos; preparacao: Centavos;
    investido: Centavos; faturado: Centavos; lucro: Centavos;
    retornoPct: number; cicloMedio: number; lucroMedio: Centavos;
    custoGarantia: Centavos; emGarantia: number;
  };
  veiculos: Veiculo[];
}

export interface Caixa {
  contas: { id: string; nome: string; tipo: string; saldo: Centavos }[];
  total: Centavos;
  capitalPorSocio: {
    socioId: string; nome: string; aportes: Centavos; retiradas: Centavos; capital: Centavos;
  }[];
  extrato: {
    id: string; data: string; descricao: string; tipo: string;
    conta: string; valor: Centavos;
    veiculo: { codigo: string; descricao: string } | null;
    /** Só as transferências podem ser apagadas daqui; o resto se desfaz na origem. */
    transferenciaId: string | null;
  }[];
}

export interface Catalogos {
  /** Um catálogo por tipo: a Honda de carro não vende CG 160. */
  marcas: Record<"carro" | "moto", { nome: string; modelos: string[] }[]>;
  cores: string[];
  categorias: { nome: string; exigeVendido: boolean }[];
  tipos: { valor: TipoVeiculo; rotulo: string; temCatalogo: boolean; etiqueta: string | null }[];
  contas: { id: string; nome: string; tipo: string }[];
  socios: { id: string; nome: string }[];
}

export interface TotaisDaLista {
  quantidade: number; custoTotal: Centavos; valorAnuncio: Centavos;
}

export interface Atalho {
  descricao: string; categoria: string; repeticoes: number; valor: Centavos;
}

export interface PreviaExclusao {
  codigo: string; descricao: string;
  custos: { quantidade: number; soma: Centavos };
  movimentos: { quantidade: number; valorDevolvido: Centavos };
  venda: { data: string; valor: Centavos } | null;
  trocas: { id: string; codigo: string; descricao: string; sentido: "entrou" | "saiu" }[];
}

export interface PreviaDesfazerVenda {
  codigo: string; descricao: string;
  venda: { data: string; valor: Centavos };
  caixa: { conta: string; valor: Centavos; saldoAtual: Centavos; cabe: boolean }[];
  comissoes: { quantidade: number; soma: Centavos };
  agioTroca: { quantidade: number; soma: Centavos };
  /** Quando preenchido, desfazer é recusado — e este é o motivo. */
  impedimento: string | null;
}

export interface PreviaExclusaoTransferencia {
  id: string;
  data: string;
  valor: Centavos;
  origem: { nome: string; saldoAtual: Centavos; fica: Centavos };
  destino: { nome: string; saldoAtual: Centavos; fica: Centavos };
  impedimento: string | null;
}

export interface ResultadoTransferencia {
  id: string;
  origem: { nome: string; saldo: Centavos };
  destino: { nome: string; saldo: Centavos };
  valor: Centavos;
}

export interface ResultadoVenda {
  lucro: Centavos; entradaEmCaixa: Centavos;
  /** `entradaEmCaixa` menos as comissões pagas na hora. */
  liquidoEmCaixa: Centavos;
  agio: Centavos;
  veiculosQueEntraram: { id: string; codigo: string }[];
  comissoesLancadas: { beneficiario: string; valor: Centavos }[];
  veiculo: Ficha;
}

// ------------------------------------------------------------------ chamadas

export const api = {
  eu: () => pedir<{ usuario: Usuario }>("GET", "/api/eu"),
  entrar: (email: string, senha: string) =>
    pedir<{ usuario: Usuario }>("POST", "/api/sessao", { email, senha }),
  sair: () => pedir<{ ok: true }>("DELETE", "/api/sessao"),

  catalogos: () => pedir<Catalogos>("GET", "/api/catalogos"),
  incluirMarca: (nome: string, tipo: TipoVeiculo = "carro") =>
    pedir("POST", "/api/catalogos/marcas", { nome, tipo }),
  incluirModelo: (marca: string, nome: string, tipo: TipoVeiculo = "carro") =>
    pedir("POST", "/api/catalogos/modelos", { marca, nome, tipo }),
  incluirCor: (nome: string) => pedir("POST", "/api/catalogos/cores", { nome }),

  // `recorte` é a query string dos filtros da §6.1, já pronta. As três
  // consultas de leitura recebem o mesmo recorte, porque os filtros do desktop
  // valem em todas as telas ao mesmo tempo.
  veiculos: (situacao: "estoque" | "vendido" | "todos", recorte = "") =>
    pedir<{ veiculos: Veiculo[]; totais?: TotaisDaLista }>(
      "GET", `/api/veiculos?situacao=${situacao}${recorte}`),
  ficha: (id: string) => pedir<Ficha>("GET", `/api/veiculos/${id}`),
  criarVeiculo: (dados: unknown) => pedir<{ id: string; codigo: string }>("POST", "/api/veiculos", dados),
  editarVeiculo: (id: string, dados: unknown) => pedir<Ficha>("PATCH", `/api/veiculos/${id}`, dados),
  previaExclusao: (id: string) => pedir<PreviaExclusao>("GET", `/api/veiculos/${id}/exclusao`),
  excluirVeiculo: (id: string) => pedir<PreviaExclusao>("DELETE", `/api/veiculos/${id}`),
  vender: (id: string, dados: unknown) =>
    pedir<ResultadoVenda>("POST", `/api/veiculos/${id}/venda`, dados),

  atalhos: () => pedir<Atalho[]>("GET", "/api/custos/atalhos"),
  lancarCusto: (dados: unknown) =>
    pedir<{ lancados: { id: string; codigo: string; valor: Centavos }[] }>("POST", "/api/custos", dados),
  excluirCusto: (id: string) =>
    pedir<{ valor: Centavos; devolvidoAoCaixa: Centavos }>("DELETE", `/api/custos/${id}`),

  caixa: () => pedir<Caixa>("GET", "/api/caixa"),
  aporte: (dados: unknown) => pedir<{ id: string }>("POST", "/api/aportes", dados),
  transferir: (dados: unknown) =>
    pedir<ResultadoTransferencia>("POST", "/api/transferencias", dados),
  previaExclusaoTransferencia: (id: string) =>
    pedir<PreviaExclusaoTransferencia>("GET", `/api/transferencias/${id}`),
  excluirTransferencia: (id: string) =>
    pedir<PreviaExclusaoTransferencia>("DELETE", `/api/transferencias/${id}`),

  previaDesfazerVenda: (id: string) =>
    pedir<PreviaDesfazerVenda>("GET", `/api/veiculos/${id}/venda`),
  desfazerVenda: (id: string) =>
    pedir<{ desfeita: PreviaDesfazerVenda; veiculo: Ficha }>(
      "DELETE", `/api/veiculos/${id}/venda`),

  painel: (recorte = "") => pedir<Painel>("GET", `/api/painel?${recorte.slice(1)}`),
  vendas: (recorte = "") => pedir<Vendas>("GET", `/api/vendas?${recorte.slice(1)}`),
};
