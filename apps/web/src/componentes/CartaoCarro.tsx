/**
 * O cartão de carro do mobile — §6.3 e §6.4.
 *
 * "Nome e placa no topo, três números, barra de envelhecimento com 'N dias em
 * pátio' ao pé." No estoque os três números são custo total, anúncio e lucro
 * projetado; nas vendas, custo total, venda e lucro. A barra de baixo troca de
 * envelhecimento para garantia.
 */

import type { Veiculo } from "../api.js";
import { dataBr, pct, reais } from "../formato.js";
import { BarraGarantia, BarraIdade, Placa, Pilula } from "./basicos.js";

export function CartaoCarro({ veiculo: v, aoTocar }: { veiculo: Veiculo; aoTocar: () => void }) {
  // §6.3: quando o anúncio não cobre o custo, anúncio e lucro projetado ficam
  // vermelhos — não existe negociação possível ali que não seja prejuízo.
  const classeProjetado =
    v.lucroProjetado === null ? "" : v.lucroProjetado > 0 && !v.anuncioAbaixoDoCusto ? "destaque" : "ruim";

  return (
    <button className="carro" onClick={aoTocar}>
      <div className="carro-top">
        <div>
          <div className="carro-nome">
            {v.marca} {v.modelo}{v.versao ? ` ${v.versao}` : ""}
          </div>
          <div className="carro-meta">
            {v.vendido
              ? <>{v.ano ?? "—"} · vendido {dataBr(v.dataVenda)}</>
              : <>{v.ano ?? "—"} · {v.cor}</>}
            {v.origem === "troca" && <> · <Pilula tipo="troca">troca</Pilula></>}
          </div>
        </div>
        <Placa numero={v.placa} />
      </div>

      <div className="carro-nums">
        <div><span>Custo total</span><b>{reais(v.custoTotal)}</b></div>
        {v.vendido ? (
          <>
            <div><span>Venda</span><b>{reais(v.valorVenda ?? 0)}</b></div>
            <div className={(v.lucro ?? 0) > 0 ? "destaque" : "ruim"}>
              <span>Lucro · {pct(v.retornoPct ?? 0)}</span><b>{reais(v.lucro ?? 0)}</b>
            </div>
          </>
        ) : (
          <>
            <div className={v.anuncioAbaixoDoCusto ? "ruim" : ""}>
              <span>Anúncio</span><b>{v.valorAnuncio ? reais(v.valorAnuncio) : "—"}</b>
            </div>
            <div className={classeProjetado}>
              <span>Lucro proj.</span>
              <b>{v.lucroProjetado === null ? "—" : reais(v.lucroProjetado)}</b>
            </div>
          </>
        )}
      </div>

      {v.vendido && v.garantia
        ? <BarraGarantia garantia={v.garantia} />
        : <BarraIdade dias={v.cicloDias} preenchimento={v.preenchimentoIdade} />}
    </button>
  );
}
