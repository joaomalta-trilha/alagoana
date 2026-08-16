/**
 * As tabelas do desktop — §6.3 e §6.4.
 *
 * As três faixas de fundo são essenciais e não são decoração: cinza é o que
 * saiu, o destaque entre divisórias é o subtotal, verde é o que pode entrar.
 * Quando o anúncio não cobre o custo, anúncio e lucro projetado ficam
 * vermelhos — não existe negociação possível ali que não seja prejuízo.
 */

import type { Veiculo } from "../api.js";
import { brl, dataBr, pct } from "../formato.js";
import { veiculos as contar } from "../tipos.js";
import { BarraGarantia, BarraIdade, Placa } from "./basicos.js";

function Identificacao({ veiculo: v }: { veiculo: Veiculo }) {
  return (
    <td>
      <div className="car-nome">{v.marca} {v.modelo}{v.versao ? ` ${v.versao}` : ""}</div>
      <div className="car-meta">
        {v.ano ?? "—"} · {v.cor}
        {v.km ? ` · ${v.km.toLocaleString("pt-BR")} km` : ""}
        {v.etiqueta ? ` · ${v.etiqueta}` : ""}
        {v.origem === "troca" ? " · troca" : ""}
      </div>
    </td>
  );
}

export function TabelaEstoque(
  { veiculos, aoAbrir }: { veiculos: Veiculo[]; aoAbrir: (id: string) => void },
) {
  if (veiculos.length === 0) {
    return (
      <div className="tbl-wrap">
        <div className="vazio">
          Nenhum veículo em estoque com esses filtros. Ajuste o período ou a marca.
        </div>
      </div>
    );
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Veículo</th>
            <th>Placa</th>
            <th>Data de compra</th>
            <th className="dir c-out">Compra</th>
            <th className="dir c-out">Custo</th>
            <th className="dir c-sum">Custo total</th>
            <th className="dir c-in">Anúncio</th>
            <th className="dir c-in">Lucro projetado</th>
            <th>Dias em pátio</th>
          </tr>
        </thead>
        <tbody>
          {veiculos.map((v) => (
            <tr key={v.id} onClick={() => aoAbrir(v.id)}>
              <Identificacao veiculo={v} />
              <td><Placa numero={v.placa} pequena /></td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>{dataBr(v.dataCompra)}</td>
              <td className="dir num c-out">{brl(v.valorCompra)}</td>
              <td className="dir num c-out">
                {brl(v.custoPreparacao)}
                <span className="sub-cel">{v.lancamentos} lanç.</span>
              </td>
              <td className="dir num c-sum">{brl(v.custoTotal)}</td>
              <td className={`dir num c-in${v.anuncioAbaixoDoCusto ? " abaixo" : ""}`}>
                {v.valorAnuncio ? brl(v.valorAnuncio) : "—"}
                <span className="sub-cel">
                  {v.fipeHoje ? `Fipe ${brl(v.fipeHoje)}` : "sem Fipe"}
                </span>
              </td>
              <td className={`dir num c-in${v.anuncioAbaixoDoCusto ? " abaixo" : ""}`}>
                {v.lucroProjetado === null ? "—" : brl(v.lucroProjetado)}
                <span className="sub-cel">
                  {v.projetadoPct === null ? "" : pct(v.projetadoPct)}
                </span>
              </td>
              <td><BarraIdade dias={v.cicloDias} preenchimento={v.preenchimentoIdade} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaVendas(
  { veiculos, aoAbrir }: { veiculos: Veiculo[]; aoAbrir: (id: string) => void },
) {
  if (veiculos.length === 0) {
    return (
      <div className="tbl-wrap">
        <div className="vazio">Nenhuma venda com esses filtros.</div>
      </div>
    );
  }

  const soma = (f: (v: Veiculo) => number) => veiculos.reduce((a, v) => a + f(v), 0);
  const investido = soma((v) => v.custoTotal);
  const faturado = soma((v) => v.valorVenda ?? 0);
  const lucro = faturado - investido;

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Veículo</th>
            <th>Placa</th>
            <th>Vendido em</th>
            <th className="dir c-out">Compra</th>
            <th className="dir c-out">Custo</th>
            <th className="dir c-sum">Custo total</th>
            <th className="dir c-in">Venda</th>
            <th className="dir c-in">Lucro</th>
            <th>Garantia</th>
          </tr>
        </thead>
        <tbody>
          {veiculos.map((v) => (
            <tr key={v.id} onClick={() => aoAbrir(v.id)}>
              <Identificacao veiculo={v} />
              <td><Placa numero={v.placa} pequena /></td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                {dataBr(v.dataVenda)}
                <span className="sub-cel">{v.cicloDias} dias</span>
              </td>
              <td className="dir num c-out">{brl(v.valorCompra)}</td>
              <td className="dir num c-out">
                {brl(v.custoPreparacao)}
                <span className="sub-cel">{v.lancamentos} lanç.</span>
              </td>
              <td className="dir num c-sum">{brl(v.custoTotal)}</td>
              <td className="dir num c-in">{brl(v.valorVenda ?? 0)}</td>
              <td className={`dir num c-in${(v.lucro ?? 0) <= 0 ? " abaixo" : ""}`}>
                {brl(v.lucro ?? 0)}
                <span className="sub-cel">{pct(v.retornoPct ?? 0)}</span>
              </td>
              <td>{v.garantia && <BarraGarantia garantia={v.garantia} />}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>
              {contar(veiculos.length)}
            </td>
            <td className="dir num c-out">{brl(soma((v) => v.valorCompra))}</td>
            <td className="dir num c-out">{brl(soma((v) => v.custoPreparacao))}</td>
            <td className="dir num c-sum">{brl(investido)}</td>
            <td className="dir num c-in">{brl(faturado)}</td>
            <td className={`dir num c-in${lucro <= 0 ? " abaixo" : ""}`}>
              {brl(lucro)}
              <span className="sub-cel">
                {pct(investido ? (lucro / investido) * 100 : 0)}
              </span>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
