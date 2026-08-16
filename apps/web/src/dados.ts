/**
 * Carregamento de dados.
 *
 * Não há cache nem estado global: o volume é de ~20 veículos e três usuários,
 * e a §2 é explícita — "não otimize para escala". Cada tela pede o que precisa
 * e, depois de qualquer gravação, a versão sobe e todas recarregam. Simples o
 * bastante para nunca mostrar número velho, que num sistema de dinheiro é o
 * defeito que importa.
 */

import { useCallback, useEffect, useState } from "react";
import { ErroApi } from "./api.js";

export interface Estado<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
  recarregar: () => void;
}

/**
 * `chave` identifica *o que* está sendo pedido: a versão dos dados mais o
 * recorte dos filtros. Mudou a chave, busca de novo.
 */
export function useDados<T>(buscar: () => Promise<T>, chave: string | number): Estado<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [local, setLocal] = useState(0);

  // `buscar` costuma ser uma seta criada no render; a dependência real é a
  // chave, não a identidade da função.
  const executar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await buscar());
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, local]);

  useEffect(() => { void executar(); }, [executar]);

  return { dados, erro, carregando, recarregar: () => setLocal((n) => n + 1) };
}

/** Sessão expirada no meio do uso: quem chama manda de volta para o login. */
export function sessaoCaiu(e: unknown): boolean {
  return e instanceof ErroApi && e.status === 401;
}
