/**
 * Estoque — §6.3.
 *
 * "Cabeçalho com contagem de carros e capital investido, e botão 'Lançar
 * carro'." No desktop, tabela ordenada por dias em pátio decrescente; no
 * mobile, cartões. A ordem já vem assim da API, porque quem ordena é quem
 * calcula.
 */

import { api } from "../api.js";
import { CartaoCarro } from "../componentes/CartaoCarro.js";
import { TabelaEstoque } from "../componentes/Tabelas.js";
import { Carregando, Vazio } from "../componentes/basicos.js";
import { useDados } from "../dados.js";
import { brl } from "../formato.js";
import { veiculos as contar } from "../tipos.js";
import { useDesktop } from "../tela.js";

export function Estoque(
  { versao, recorte, aoAbrirFicha, aoLancarCarro }:
  { versao: number; recorte: string; aoAbrirFicha: (id: string) => void; aoLancarCarro: () => void },
) {
  const desktop = useDesktop();
  const { dados, erro, carregando } = useDados(
    () => api.veiculos("estoque", recorte), `${versao}|${recorte}`);

  if (erro) return <Vazio>{erro}</Vazio>;
  if (carregando && !dados) return <Carregando />;

  const veiculos = dados?.veiculos ?? [];
  // Somado no backend: é o mesmo número que o painel chama de capital
  // imobilizado, e somar nos dois lugares é como se diverge de si mesmo.
  const investido = dados?.totais?.custoTotal ?? 0;

  return (
    <>
      {desktop ? (
        <div className="card cabecalho-lista">
          <div>
            <h3>Estoque</h3>
            <p className="hint">
              {veiculos.length
                ? `${contar(veiculos.length)} no pátio · ${brl(investido)} investidos`
                : "Nenhum veículo no recorte atual"}
            </p>
          </div>
          <button className="btn" onClick={aoLancarCarro}>Lançar carro</button>
        </div>
      ) : (
        <>
          <div className="card entre">
            <div>
              <div className="cxt">No pátio</div>
              <div className="num" style={{ fontSize: 19, fontWeight: 500 }}>
                {contar(veiculos.length)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cxt">Investido</div>
              <div className="num" style={{ fontSize: 19, fontWeight: 500 }}>{brl(investido)}</div>
            </div>
          </div>
          <button className="btn" style={{ marginBottom: 14 }} onClick={aoLancarCarro}>
            Lançar carro
          </button>
        </>
      )}

      {desktop
        ? <TabelaEstoque veiculos={veiculos} aoAbrir={aoAbrirFicha} />
        : veiculos.length === 0
          ? <Vazio>Nenhum veículo no pátio.</Vazio>
          : veiculos.map((v) => (
              <CartaoCarro key={v.id} veiculo={v} aoTocar={() => aoAbrirFicha(v.id)} />
            ))}
    </>
  );
}
