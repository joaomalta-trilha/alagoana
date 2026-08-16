/**
 * Onde o app está sendo visto.
 *
 * O corte é o mesmo do CSS (900px). Vale repetir o número aqui porque a
 * diferença entre celular e mesa não é só de arranjo: no estoque e nas vendas,
 * cartão e tabela são estruturas diferentes, e renderizar as duas para
 * esconder uma seria pagar por DOM que ninguém vê.
 */

import { useSyncExternalStore } from "react";

export const CORTE_DESKTOP = 900;

const consulta = window.matchMedia(`(min-width: ${CORTE_DESKTOP}px)`);

function assinar(aoMudar: () => void): () => void {
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

export function useDesktop(): boolean {
  return useSyncExternalStore(assinar, () => consulta.matches, () => false);
}
