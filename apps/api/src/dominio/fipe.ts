/**
 * Tabela Fipe — o que é regra, não rede.
 *
 * A Fipe não conhece "Hyundai HB20": ela tem 116 versões de HB20, e entre as
 * de 2014 a mais barata e a mais cara diferem 31% — R$ 40.107 contra
 * R$ 52.553. Por isso a versão é escolhida uma vez, na mão, e o código dela
 * fica gravado no veículo; daí em diante a consulta é exata e automática.
 *
 * Este arquivo é só função pura: casar nomes, ler valor, decidir se a tabela
 * virou. Quem fala com a rede é `servicos/fipe.ts`.
 */

import type { Centavos } from "./dinheiro.js";
import type { TipoVeiculo } from "./tipo-veiculo.js";

/** Os dois catálogos da Fipe. `outro` não tem tabela. */
export type TipoFipe = "carros" | "motos";

export function tipoFipe(tipo: TipoVeiculo): TipoFipe | null {
  if (tipo === "carro") return "carros";
  if (tipo === "moto") return "motos";
  return null;
}

/** Sem acento, sem caixa, sem espaço sobrando. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Onde o nosso catálogo e o da Fipe discordam.
 *
 * Das 47 marcas que temos, 44 casam por caixa apenas. Estas três a Fipe
 * escreve com o nome do grupo junto, e nenhuma regra genérica acerta isso.
 */
const APELIDOS: Record<string, string> = {
  chevrolet: "gm - chevrolet",
  volkswagen: "vw - volkswagen",
  kia: "kia motors",
};

/** Acha a marca da Fipe correspondente à nossa. Devolve o código, ou nulo. */
export function casarMarca(
  nossa: string, daFipe: ReadonlyArray<{ codigo: string; nome: string }>,
): string | null {
  const alvo = APELIDOS[normalizar(nossa)] ?? normalizar(nossa);
  return daFipe.find((m) => normalizar(m.nome) === alvo)?.codigo ?? null;
}

/**
 * As versões da Fipe que podem ser o nosso modelo.
 *
 * Casa por palavra, não por prefixo: "Ka Sedan" está em "Ka 1.5 Sedan SE 12V
 * Flex 4p Mec." e "Fazer 250" está em "YS 250 FAZER/ FAZER L. EDITION". Um
 * prefixo devolveria zero nos dois — e devolveu, quando a regra era essa.
 *
 * Sem candidato, devolve a lista inteira: melhor uma lista longa do que uma
 * tela sem saída.
 */
export function candidatosDeModelo<T extends { nome: string }>(
  nossoModelo: string, daFipe: ReadonlyArray<T>,
): T[] {
  const palavras = normalizar(nossoModelo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [...daFipe];

  const casam = daFipe.filter((m) => {
    const nome = normalizar(m.nome);
    return palavras.every((p) => nome.includes(p));
  });
  return casam.length > 0 ? casam : [...daFipe];
}

/**
 * "R$ 41.247,00" em centavos.
 *
 * A Fipe manda string formatada; converter na borda mantém a regra do
 * projeto — nenhum ponto flutuante toca valor monetário.
 */
export function valorParaCentavos(valor: string): Centavos | null {
  const limpo = valor.replace(/[^\d,]/g, "").replace(",", "");
  if (!/^\d+$/.test(limpo)) return null;
  const centavos = Number(limpo);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/**
 * O ano-modelo que a Fipe usa, no formato dela.
 *
 * A lista de anos vem como "2014 Gasolina" / "2014 Flex" / "32000 Zero KM".
 * Escolhe o do ano do veículo; havendo mais de um combustível, o primeiro,
 * porque a diferença entre eles é pequena perto de errar a versão.
 */
export function anoDaFipe(
  ano: number | null, anos: ReadonlyArray<{ codigo: string; nome: string }>,
): string | null {
  if (anos.length === 0) return null;
  if (ano === null) return anos[0]!.codigo;
  return anos.find((a) => a.nome.startsWith(String(ano)))?.codigo ?? null;
}

/**
 * A tabela virou o mês?
 *
 * A Fipe publica uma tabela por mês e devolve a referência em cada consulta
 * ("agosto de 2026"). Comparar essa string é mais confiável do que contar
 * dias: a data de publicação não é fixa no calendário.
 */
export function tabelaMudou(gravada: string | null, atual: string): boolean {
  if (gravada === null) return true;
  return normalizar(gravada) !== normalizar(atual);
}
