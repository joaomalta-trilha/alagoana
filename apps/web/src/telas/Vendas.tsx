/**
 * Vendas — §6.4.
 *
 * Desktop: consolidado com os nove números e a tabela com as mesmas faixas do
 * estoque, mais lucro e garantia, com linha de totais no rodapé. Mobile:
 * consolidado resumido em quatro linhas e cartões por venda.
 */

import { api } from "../api.js";
import { CartaoCarro } from "../componentes/CartaoCarro.js";
import { TabelaVendas } from "../componentes/Tabelas.js";
import { Carregando, Vazio } from "../componentes/basicos.js";
import { useDados } from "../dados.js";
import { brl, pct } from "../formato.js";
import { useDesktop } from "../tela.js";

export function Vendas(
  { versao, recorte, aoAbrirFicha }:
  { versao: number; recorte: string; aoAbrirFicha: (id: string) => void },
) {
  const desktop = useDesktop();
  const { dados, erro, carregando } = useDados(
    () => api.vendas(recorte), `${versao}|${recorte}`);

  if (erro) return <Vazio>{erro}</Vazio>;
  if (carregando && !dados) return <Carregando />;
  if (!dados) return null;

  const { consolidado: c, veiculos } = dados;

  if (veiculos.length === 0) {
    return <Vazio>Nenhuma venda no recorte atual.</Vazio>;
  }

  if (desktop) {
    return (
      <>
        <div className="kpis" style={{ marginBottom: 14 }}>
          <div className="kpi"><span>Carros vendidos</span><b>{c.vendidos}</b></div>
          <div className="kpi"><span>Total investido</span><b>{brl(c.investido)}</b></div>
          <div className="kpi"><span>Total faturado</span><b>{brl(c.faturado)}</b></div>
          <div className="kpi">
            <span>Lucro total</span><b className="pos">{brl(c.lucro)}</b>
            <i>sobre o investido</i>
          </div>
          <div className="kpi"><span>Retorno</span><b className="pos">{pct(c.retornoPct)}</b></div>
          <div className="kpi"><span>Ciclo médio</span><b>{c.cicloMedio}d</b><i>compra até venda</i></div>
          <div className="kpi"><span>Lucro médio por carro</span><b>{brl(c.lucroMedio)}</b></div>
          <div className="kpi">
            <span>Custo de garantia</span><b className="neg">{brl(c.custoGarantia)}</b>
            <i>retornos lançados</i>
          </div>
          <div className="kpi">
            <span>Em garantia</span><b>{c.emGarantia}</b><i>ainda com exposição</i>
          </div>
        </div>

        <TabelaVendas veiculos={veiculos} aoAbrir={aoAbrirFicha} />
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div className="bloco-t" style={{ marginTop: 0 }}>Consolidado</div>
        <div className="pat-linha">
          <span>{c.vendidos} {c.vendidos === 1 ? "carro vendido" : "carros vendidos"}</span>
          <b>{brl(c.faturado)}</b>
        </div>
        <div className="pat-linha"><span>Total investido</span><b>{brl(c.investido)}</b></div>
        <div className="pat-linha">
          <span>Custo de garantia</span>
          <b className="neg">{brl(c.custoGarantia)}</b>
        </div>
        <div className="pat-linha tot">
          <span>Lucro total · {pct(c.retornoPct)}</span>
          <b className="pos">{brl(c.lucro)}</b>
        </div>
      </div>

      {veiculos.map((v) => (
        <CartaoCarro key={v.id} veiculo={v} aoTocar={() => aoAbrirFicha(v.id)} />
      ))}
    </>
  );
}
