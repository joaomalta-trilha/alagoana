/**
 * Conferência da carga — a rede de segurança do projeto.
 *
 * A linha de base foi a tabela da §9 até 16/08/2026, quando a loja mandou a
 * planilha atualizada: 20 veículos, uma venda a mais (Tracker), o repasse do
 * Ford Ka e três veículos novos, um deles moto. Os números abaixo descrevem
 * esse retrato, e foram conferidos contra os totais que a própria planilha
 * declara, categoria por categoria.
 *
 * Lê do Postgres e recalcula com as funções de domínio. Se qualquer número
 * divergir, a importação está errada e o processo sai com código 1.
 *
 * Roda contra a data em que o protótipo foi congelado, não contra hoje: das
 * dez conferências, nenhuma depende de "hoje", mas o ciclo dos carros em
 * pátio depende, e queremos um resultado reprodutível daqui a um ano.
 */

import { pool } from "../conexao.js";
import { deNumeric, reais, type Centavos } from "../../dominio/dinheiro.js";
import { custoTotal, lucro, retornoPct, cicloDias, patrimonio } from "../../dominio/veiculo.js";
import { CATEGORIAS_CUSTO } from "../../dominio/categorias.js";

const ESPERADO = {
  "veículos": 20,
  "lançamentos": 239,
  "vendidos": 13,
  "em estoque": 7,
  "total faturado": 75_446_724,
  "lucro total": 7_578_061,
  "investido nos vendidos": 67_868_663,
  "retorno sobre o investido": "11,2%",
  "ciclo médio": 67,
  "estoque ao custo": 29_530_262,
  "caixa total": 8_387_192,
  "patrimônio total": 37_917_454,
} as const;

const MONETARIOS = new Set([
  "total faturado", "lucro total", "investido nos vendidos",
  "estoque ao custo", "caixa total", "patrimônio total",
]);

interface Linha {
  codigo: string;
  marca: string;
  modelo: string;
  versao: string | null;
  data_compra: string;
  data_venda: string | null;
  valor_compra: string;
  valor_venda: string | null;
  valor_anuncio: string | null;
  custo_preparacao: string;
  lancamentos: string;
}

const { rows: veiculos } = await pool.query<Linha>(`
  select v.codigo, v.marca, v.modelo, v.versao, v.data_compra, v.data_venda,
         v.valor_compra, v.valor_venda, v.valor_anuncio,
         cv.custo_preparacao, cv.lancamentos
    from veiculo v
    join custo_veiculo cv on cv.veiculo_id = v.id
   order by v.codigo`);

const { rows: contas } = await pool.query<{ saldo: string }>("select saldo from saldo_conta");
const { rows: implantacao } = await pool.query<{ valor: string }>(
  "select valor from config where chave = 'data_implantacao'");
const HOJE = String(implantacao[0]!.valor);

const calculado = veiculos.map((v) => {
  const compra = deNumeric(v.valor_compra)!;
  const prep = deNumeric(v.custo_preparacao)!;
  const total = custoTotal(compra, prep);
  const venda = deNumeric(v.valor_venda);
  return {
    ...v,
    compra, prep, total, venda,
    anuncio: deNumeric(v.valor_anuncio),
    vendido: v.data_venda !== null,
    ciclo: cicloDias(v.data_compra, v.data_venda, HOJE),
    lucro: venda === null ? null : lucro(venda, total),
  };
});

const vendidos = calculado.filter((v) => v.vendido);
const estoque = calculado.filter((v) => !v.vendido);

const faturado = vendidos.reduce((a, v) => a + v.venda!, 0);
const investido = vendidos.reduce((a, v) => a + v.total, 0);
const lucroTotal = faturado - investido;
const caixa = contas.reduce((a, c) => a + deNumeric(c.saldo)!, 0);
const pat = patrimonio(caixa, estoque.map((v) => ({ custoTotal: v.total, valorAnuncio: v.anuncio })));

const obtido: Record<string, number | string> = {
  "veículos": calculado.length,
  "lançamentos": calculado.reduce((a, v) => a + Number(v.lancamentos), 0),
  "vendidos": vendidos.length,
  "em estoque": estoque.length,
  "total faturado": faturado,
  "lucro total": lucroTotal,
  "investido nos vendidos": investido,
  "retorno sobre o investido": `${retornoPct(lucroTotal, investido).toFixed(1).replace(".", ",")}%`,
  "ciclo médio": Math.round(vendidos.reduce((a, v) => a + v.ciclo, 0) / vendidos.length),
  "estoque ao custo": pat.estoqueCusto,
  "caixa total": pat.caixaTotal,
  "patrimônio total": pat.patrimonioTotal,
};

const fmt = (chave: string, v: number | string) =>
  MONETARIOS.has(chave) ? reais(v as Centavos) : String(v);

let ok = true;
console.log(`\n  CONFERÊNCIA DA SEÇÃO 9  ·  lido do Postgres  ·  hoje = ${HOJE}\n`);
console.log(`  ${"".padEnd(28)}${"esperado".padStart(16)}  ${"calculado".padStart(16)}`);
for (const [chave, esperado] of Object.entries(ESPERADO)) {
  const valor = obtido[chave]!;
  const bate = valor === esperado;
  ok &&= bate;
  console.log(`  ${chave.padEnd(28)}${fmt(chave, esperado).padStart(16)}  ` +
              `${fmt(chave, valor).padStart(16)}   ${bate ? "ok" : "DIVERGE"}`);
}

console.log("\n  POR VEÍCULO\n");
console.log(`  ${"cód".padEnd(6)}${"veículo".padEnd(27)}${"lanç".padStart(5)}` +
            `${"compra".padStart(14)}${"preparação".padStart(14)}${"custo total".padStart(14)}${"lucro".padStart(14)}`);
for (const v of calculado) {
  const nome = `${v.marca} ${v.modelo}${v.versao ? ` ${v.versao}` : ""}`;
  console.log(`  ${v.codigo.padEnd(6)}${nome.padEnd(27)}${String(v.lancamentos).padStart(5)}` +
    `${reais(v.compra).padStart(14)}${reais(v.prep).padStart(14)}${reais(v.total).padStart(14)}` +
    `${(v.lucro === null ? "—" : reais(v.lucro)).padStart(14)}`);
}

// Os dois veículos que a especificação usa como exemplo por extenso. Os
// valores mudaram com a planilha de 16/08: o City levou uma multa de R$ 131,46
// depois da venda, e o Tracker deixou de estar em estoque — foi vendido por
// 83.000 em 10/08. A §4 continua valendo; o que mudou foi o dado.
console.log("\n  OS DOIS EXEMPLOS DA ESPECIFICAÇÃO, HOJE\n");
const city = calculado.find((v) => v.codigo === "V-07")!;
const tracker = calculado.find((v) => v.codigo === "V-13")!;
const pct = retornoPct(city.lucro!, city.total);
const exemplos: [string, string, string][] = [
  ["Honda City · custo total", reais(city.total), "93.984,66"],
  ["Honda City · lucro", reais(city.lucro!), "3.015,34"],
  ["Honda City · retorno", `${pct.toFixed(2).replace(".", ",")}%`, "3,21%"],
  ["Honda City · ciclo", `${city.ciclo} dias`, "170 dias"],
  ["Tracker · custo total", reais(tracker.total), "71.283,46"],
  ["Tracker · lucro", reais(tracker.lucro!), "11.716,54"],
];
for (const [rotulo, obtidoTxt, esperadoTxt] of exemplos) {
  const bate = obtidoTxt === esperadoTxt;
  ok &&= bate;
  console.log(`  ${rotulo.padEnd(28)}${esperadoTxt.padStart(16)}  ${obtidoTxt.padStart(16)}   ${bate ? "ok" : "DIVERGE"}`);
}

// ---------------------------------------------------------------- catálogos
// A §3.7 fixa os tamanhos dos catálogos e a §9 diz que o extrato começa
// vazio. São conferências baratas que pegam seed pela metade.
const { rows: contagens } = await pool.query<Record<string, string>>(`
  select (select count(*) from marca where tipo = 'carro')  as "marcas de carro",
         (select count(*) from modelo mo join marca m on m.id = mo.marca_id
           where m.tipo = 'carro')                          as "modelos de carro",
         (select count(*) from marca where tipo = 'moto')   as "marcas de moto",
         (select count(*) from modelo mo join marca m on m.id = mo.marca_id
           where m.tipo = 'moto')                           as "modelos de moto",
         (select count(*) from cor)             as cores,
         (select count(*) from categoria_custo) as categorias,
         (select count(*) from usuario)         as usuarios,
         (select count(*) from conta)           as contas,
         (select count(*) from movimento_caixa) as movimentos`);

const CONTAGENS_ESPERADAS: Record<string, number> = {
  "marcas de carro": 27, "modelos de carro": 268,
  "marcas de moto": 20, "modelos de moto": 170,
  cores: 16, categorias: CATEGORIAS_CUSTO.length,
  usuarios: 3, contas: 4, movimentos: 0,
};

// Duas contagens crescem com o uso legítimo e não podem ser exatas: a loja
// cria usuários (`npm run usuario`) e lança caixa. Aqui o que interessa é o
// piso — nenhum sumiu — e não o número redondo da carga.
const MINIMOS = new Set(["usuarios", "movimentos"]);

console.log("\n  CATÁLOGOS E ACESSO\n");
for (const [chave, esperado] of Object.entries(CONTAGENS_ESPERADAS)) {
  const valor = Number(contagens[0]![chave]);
  const bate = MINIMOS.has(chave) ? valor >= esperado : valor === esperado;
  ok &&= bate;
  const rotulo = MINIMOS.has(chave) ? `no mínimo ${esperado}` : String(esperado);
  console.log(`  ${chave.padEnd(28)}${rotulo.padStart(16)}  ` +
              `${String(valor).padStart(16)}   ${bate ? "ok" : "DIVERGE"}`);
}

// A lista fechada da §3.7 vive em `dominio/categorias.ts`; a tabela é cópia.
// Aqui as duas se olham no espelho — inclusive na ordem e nas duas regras
// especiais, que é o que a migração 0002 grava em coluna.
const { rows: doBanco } = await pool.query<
  { nome: string; selecionavel: boolean; exige_vendido: boolean }
>("select nome, selecionavel, exige_vendido from categoria_custo order by ordem");

const espelho = JSON.stringify(doBanco.map((c) => [c.nome, c.selecionavel, c.exige_vendido]));
const codigo = JSON.stringify(CATEGORIAS_CUSTO.map((c) => [c.nome, c.selecionavel, c.exigeVendido]));
const categoriasBatem = espelho === codigo;
ok &&= categoriasBatem;
console.log(`  ${"categorias × dominio".padEnd(28)}${"idênticas".padStart(16)}  ` +
            `${(categoriasBatem ? "idênticas" : "DIFEREM").padStart(16)}   ` +
            `${categoriasBatem ? "ok" : "DIVERGE"}`);

// Sem senha definida ninguém entra — e a §10 pede login funcionando nesta
// etapa. Não é erro de carga, então avisa sem derrubar a conferência.
const { rows: semSenha } = await pool.query<{ email: string }>(
  "select email from usuario where senha_hash is null and ativo order by email");
if (semSenha.length) {
  console.log(`\n  aviso: ${semSenha.map((u) => u.email).join(", ")} ainda sem senha.`);
  console.log("         defina com  npm run senha -- <e-mail>");
}

console.log(`\n  ${ok ? "TUDO CONFERE" : "HÁ DIVERGÊNCIA — não avance"}\n`);
await pool.end();
process.exit(ok ? 0 : 1);
