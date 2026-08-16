/**
 * Dinheiro em centavos inteiros, do banco à tela.
 *
 * O Postgres guarda numeric(12,2) e o driver `pg` devolve string — nunca
 * number. Convertemos essa string para centavos inteiros aqui, na borda, e
 * a partir daí não existe mais ponto flutuante em nenhum cálculo de valor.
 * O maior número deste domínio é da ordem de 10^8 centavos, quatro ordens de
 * grandeza abaixo de Number.MAX_SAFE_INTEGER.
 */

/** Valor monetário em centavos inteiros. */
export type Centavos = number;

/** Converte a string de um numeric(12,2) do Postgres para centavos. */
export function deNumeric(valor: string | number | null): Centavos | null {
  if (valor === null) return null;
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim();
  const negativo = texto.startsWith("-");
  const [inteira = "0", decimal = ""] = texto.replace("-", "").split(".");
  const cent = Number(inteira) * 100 + Number((decimal + "00").slice(0, 2));
  if (!Number.isSafeInteger(cent)) {
    throw new Error(`valor monetário fora da faixa segura: ${texto}`);
  }
  return negativo ? -cent : cent;
}

/** Converte centavos para a string que o Postgres aceita em numeric(12,2). */
export function paraNumeric(centavos: Centavos): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new Error(`centavos precisa ser inteiro: ${centavos}`);
  }
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "R$ 93.853,20" */
export function brl(centavos: Centavos): string {
  return `R$ ${reais(centavos)}`;
}

/** "93.853,20" — sem o símbolo, para tabelas alinhadas. */
export function reais(centavos: Centavos): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const inteira = Math.trunc(abs / 100).toLocaleString("pt-BR");
  return `${sinal}${inteira},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Divide um valor entre n destinos sem perder centavo.
 *
 * O resto é distribuído de um em um nos primeiros destinos, de modo que a
 * soma das partes é sempre exatamente igual ao total. É isso que garante que
 * o rateio de um custo bata com o que saiu da conta: 369,46 entre três vira
 * 123,16 + 123,15 + 123,15, e não três vezes 123,15 com um centavo sumido.
 */
export function ratear(total: Centavos, destinos: number): Centavos[] {
  if (destinos < 1) throw new Error("rateio precisa de ao menos um destino");
  const base = Math.trunc(total / destinos);
  const resto = total - base * destinos;
  return Array.from({ length: destinos }, (_, i) => base + (i < resto ? 1 : 0));
}
