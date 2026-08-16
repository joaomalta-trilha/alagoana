/** Os componentes recorrentes da §7.3. */

import type { ReactNode } from "react";
import type { Garantia } from "../api.js";
import { classeIdade } from "../formato.js";

/**
 * Placa Mercosul — retângulo branco, borda preta, tarja azul com "BRASIL".
 * Três tamanhos na §7.3; o mobile usa dois: 96px na lista e 150px na ficha.
 */
export function Placa(
  { numero, grande, pequena }: { numero: string; grande?: boolean; pequena?: boolean },
) {
  return (
    <div className={`plate${grande ? " g" : ""}${pequena ? " sm" : ""}`}>
      <div className="plate-top">
        <i />BRASIL<i style={{ visibility: "hidden" }} />
      </div>
      <div className="plate-num">{numero}</div>
    </div>
  );
}

/**
 * Barra de envelhecimento — trilho cinza, preenchimento na cor da faixa e o
 * número de dias ao lado, também na cor da faixa (§4.3 e §7.3).
 */
export function BarraIdade({ dias, preenchimento }: { dias: number; preenchimento: number }) {
  return (
    <div className={`age ${classeIdade(dias)}`}>
      <div className="age-track">
        <div className="age-fill" style={{ width: `${preenchimento}%` }} />
      </div>
      <span className="age-d">{dias} dias em pátio</span>
    </div>
  );
}

/** Barra de garantia — mesma estrutura, âmbar quando ativa, cinza quando não. */
export function BarraGarantia({ garantia }: { garantia: Garantia }) {
  return (
    <div className="age">
      <div className="age-track">
        <div
          className={`age-fill ${garantia.ativa ? "gfill" : "gfim"}`}
          style={{ width: `${garantia.preenchimento}%` }}
        />
      </div>
      <span className={`age-d${garantia.ativa ? " gar-ativa" : ""}`}>
        {garantia.ativa ? `garantia: faltam ${garantia.diasRestantes}d` : "garantia encerrada"}
      </span>
    </div>
  );
}

export function Pilula({ tipo, children }: { tipo: "ok" | "gar" | "troca"; children: ReactNode }) {
  return <span className={`pill p-${tipo}`}>{children}</span>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>;
}

export function Carregando() {
  return <div className="carregando">Carregando…</div>;
}
