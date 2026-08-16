/**
 * Barra superior azul e navegação inferior fixa de quatro ícones — §6.1.
 *
 * Os ícones são os mesmos traçados do protótipo. A barra inferior é fixa e
 * respeita `safe-area-inset-bottom`, para não ficar embaixo do indicador de
 * gesto do iPhone.
 */

import type { ReactElement } from "react";

export type Aba = "painel" | "estoque" | "vendas" | "caixa";

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
};

export const ABAS: [Aba, string][] = [
  ["painel", "Painel"], ["estoque", "Estoque"], ["vendas", "Vendas"], ["caixa", "Caixa"],
];

export function Topo({ tela, aoSair }: { tela: string; aoSair: () => void }) {
  return (
    <div className="top">
      <div className="marca">
        <span className="selo">A</span>
        <span className="nome">Alagoana</span>
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
    <nav className="nav">
      {ABAS.map(([id, rotulo]) => (
        <button
          key={id}
          className={id === aba ? "on" : ""}
          onClick={() => aoTrocar(id)}
          aria-current={id === aba ? "page" : undefined}
        >
          <svg viewBox="0 0 24 24">{ICONES[id]}</svg>
          {rotulo}
        </button>
      ))}
    </nav>
  );
}
