/**
 * Dinheiro e datas na borda da interface.
 *
 * A API fala em centavos inteiros. A tela fala em português. Este arquivo é a
 * única passagem entre os dois — nenhum componente faz conta com dinheiro.
 */

export type Centavos = number;

/** "R$ 93.853" — sem centavos, como o protótipo mobile mostra os agregados. */
export function brl(centavos: Centavos): string {
  return `R$ ${Math.round(centavos / 100).toLocaleString("pt-BR")}`;
}

/**
 * "R$ 93.853,20" — com centavos.
 *
 * Usado onde o número é conferido lançamento a lançamento: a lista de custos e
 * a análise financeira da ficha. Ali, arredondar esconderia justamente o que a
 * pessoa foi olhar.
 */
export function brlExato(centavos: Centavos): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const inteira = Math.trunc(abs / 100).toLocaleString("pt-BR");
  return `${sinal}R$ ${inteira},${String(abs % 100).padStart(2, "0")}`;
}

/** "R$ 64 mil" — para o rodapé de KPI, onde a ordem de grandeza basta. */
export function brlCurto(centavos: Centavos): string {
  return `R$ ${Math.round(centavos / 100_000)} mil`;
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

/** Centavos para o texto que volta ao campo: "1234.56". */
export function paraCampo(centavos: Centavos | null): string {
  if (centavos === null) return "";
  return `${Math.trunc(centavos / 100)},${String(Math.abs(centavos) % 100).padStart(2, "0")}`;
}

export function inteiroOuNulo(texto: string): number | null {
  const limpo = texto.replace(/\D/g, "");
  return limpo ? Number(limpo) : null;
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
