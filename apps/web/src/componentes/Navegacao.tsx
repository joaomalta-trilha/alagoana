/**
 * Barra superior azul e navegação inferior fixa — §6.1.
 *
 * A barra inferior nasceu com quatro ícones fixos; Despesas entrou como
 * quinto em 16/09/2026, mais estreitos. A ordem do mobile não é a do
 * desktop: no celular o Estoque fica no centro, o ponto que o polegar
 * alcança sem esforço — é a aba mais usada, com um destaque sutil para
 * ancorar o olho ali. No desktop essa lógica de alcance não existe, e a
 * ordem antiga (Painel, Estoque, Vendas, Caixa) se mantém, só com Despesas
 * no fim.
 */

import type { ReactElement } from "react";

export type Aba = "painel" | "estoque" | "vendas" | "caixa" | "despesas";

const ICONES: Record<Aba, ReactElement> = {
  painel: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
  estoque: (
    <>
      <path d="M5 17h14M5 17a2 2 0 1 0 4 0M5 17a2 2 0 1 1 4 0m6 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0M3 17V9l2-5h14l2 5v8" />
      <path d="M3 9h18" />
    </>
  ),
  vendas: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>
  ),
  caixa: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 10h20M16 15h3" />
    </>
  ),
  despesas: (
    <>
      <path d="M6 2h9l3 3v17H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
};

const ROTULOS: Record<Aba, string> = {
  painel: "Painel", estoque: "Estoque", vendas: "Vendas", caixa: "Caixa", despesas: "Despesas",
};

/** Ordem das abas no topo do desktop — a de sempre, com Despesas no fim. */
export const ORDEM_DESKTOP: Aba[] = ["painel", "estoque", "vendas", "caixa", "despesas"];

/** Ordem na barra inferior do mobile — Estoque no centro, de propósito. */
export const ORDEM_MOBILE: Aba[] = ["painel", "vendas", "estoque", "caixa", "despesas"];

/** Compat: código antigo que só conhecia a ordem do desktop. */
export const ABAS: [Aba, string][] = ORDEM_DESKTOP.map((id) => [id, ROTULOS[id]]);

export function Topo({ tela, aoSair }: { tela: string; aoSair: () => void }) {
  return (
    <div className="top">
      <div className="marca">
        <span className="logo" role="img" aria-label="Alagoana Veículos" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span className="tela">{tela}</span>
        <button className="sair" onClick={aoSair}>Sair</button>
      </div>
    </div>
  );
}

export function Navegacao({ aba, aoTrocar }: { aba: Aba; aoTrocar: (a: Aba) => void }) {
  return (
    <nav className="nav nav-5">
      {ORDEM_MOBILE.map((id) => (
        <button
          key={id}
          className={`${id === aba ? "on" : ""}${id === "estoque" ? " nav-centro" : ""}`}
          onClick={() => aoTrocar(id)}
          aria-current={id === aba ? "page" : undefined}
        >
          <svg viewBox="0 0 24 24">{ICONES[id]}</svg>
          {ROTULOS[id]}
        </button>
      ))}
    </nav>
  );
}
