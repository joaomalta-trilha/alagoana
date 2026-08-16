/**
 * Dinheiro e datas na borda da interface.
 *
 * A API fala em centavos inteiros. A tela fala em português. Este arquivo é a
 * única passagem entre os dois — nenhum componente faz conta com dinheiro.
 */

export type Centavos = number;

/**
 * "R$ 93.853,20" — o único formatador de dinheiro da interface.
 *
 * Sempre com centavos, em toda tela. Houve uma versão que arredondava os
 * agregados e só mostrava centavo na ficha; os dados reais têm centavo
 * — R$ 218,26 de lucro no Cruze, R$ 4.183,46 de preparação no Tracker — e
 * arredondar escondia justamente o que a pessoa foi conferir.
 *
 * A parte inteira é montada a partir dos centavos e não de uma divisão: o
 * projeto inteiro trata dinheiro como inteiro, e `centavos / 100` reintroduz
 * ponto flutuante no último passo, logo antes de a pessoa ler o número.
 *
 * A única exceção são os eixos dos gráficos, onde "R$ 20k" é a leitura certa.
 * Essa abreviação vive junto do gráfico que a usa, não aqui.
 */
export function brl(centavos: Centavos): string {
  const sinal = centavos < 0 ? "-" : "";
  return `${sinal}R$ ${reais(Math.abs(centavos))}`;
}

/**
 * "93.853,20" — o mesmo número, sem o símbolo.
 *
 * Existe para os três números do cartão do celular, onde cada coluna tem 97px
 * e "R$ 269.086,08" mede 114 — quebrava em duas linhas. Diminuir a fonte
 * resolvia por dois pixels, o que quebraria de novo no primeiro valor maior.
 * O rótulo em cima de cada coluna já diz que é dinheiro; repetir o símbolo
 * três vezes na mesma linha custava justamente os dígitos.
 */
export function reais(centavos: Centavos): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const inteira = Math.trunc(abs / 100).toLocaleString("pt-BR");
  return `${sinal}${inteira},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Lê o que a pessoa digitou e devolve centavos.
 *
 * Aceita `1234`, `1234,56`, `1.234,56` e `1234.56`, porque num teclado de
 * celular sai de tudo. Devolve `null` quando não dá para entender — quem chama
 * decide a mensagem, que a §8 exige ser específica.
 */
export function paraCentavos(texto: string): Centavos | null {
  const limpo = texto.trim();
  if (!limpo) return null;

  // Separador decimal é o último ponto ou vírgula que tenha 1 ou 2 dígitos
  // depois. O resto é separador de milhar e some.
  const decimal = /[.,](\d{1,2})$/.exec(limpo);
  const inteiraBruta = decimal ? limpo.slice(0, decimal.index) : limpo;
  const inteira = inteiraBruta.replace(/[.\s,]/g, "");

  if (!/^-?\d*$/.test(inteira) || (!inteira && !decimal)) return null;
  const centavosDecimais = decimal ? (decimal[1]! + "0").slice(0, 2) : "00";
  const negativo = inteira.startsWith("-");

  const valor = Number(inteira.replace("-", "") || "0") * 100 + Number(centavosDecimais);
  if (!Number.isSafeInteger(valor)) return null;
  return negativo ? -valor : valor;
}

/** Centavos para o texto que volta ao campo: "1234,56". */
export function paraCampo(centavos: Centavos | null): string {
  if (centavos === null) return "";
  return `${Math.trunc(centavos / 100)},${String(Math.abs(centavos) % 100).padStart(2, "0")}`;
}

/** "2026-08-03" → "03/08/2026" */
export function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Hoje em Maceió, no formato que a API espera. */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Maceio" }).format(new Date());
}

export function pct(valor: number, casas = 1): string {
  return `${valor.toFixed(casas).replace(".", ",")}%`;
}

/** Faixa de envelhecimento da §4.3, no nome de classe que o CSS espera. */
export function classeIdade(dias: number): string {
  return dias <= 30 ? "a0" : dias <= 60 ? "a1" : dias <= 90 ? "a2" : "a3";
}
