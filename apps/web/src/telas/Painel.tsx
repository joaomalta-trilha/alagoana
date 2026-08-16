/**
 * Painel — §6.2.
 *
 * A regra visual que a especificação manda preservar: **cor identifica
 * natureza** (azul = dinheiro, verde = mercadoria) e **peso identifica
 * certeza** (sólido = fato, cinza claro = projeção). Por isso o bloco de baixo
 * é inteiro em cinza, com a barra vertical tracejada, e termina no aviso de
 * que projeção não é resultado.
 *
 * São seis gráficos no desktop e dois no mobile — os dois que respondem as
 * perguntas que se faz de pé: o que está parando, e para onde o dinheiro foi.
 */

import { useMemo } from "react";
import { api, type Painel as DadosPainel } from "../api.js";
import { Carregando, Vazio } from "../componentes/basicos.js";
import { Grafico, eixoRotulo, eixoValor, opcoesBase } from "../componentes/Grafico.js";
import { useDados } from "../dados.js";
import { brl, pct } from "../formato.js";
import { useDesktop } from "../tela.js";

const emMil = (n: unknown) => `R$ ${Math.round(Number(n) / 1000)}k`;

function graficos(d: DadosPainel, desktop: boolean) {
  const g = d.graficos;

  const envelhecimento = {
    type: "bar" as const,
    data: {
      labels: g.envelhecimento.map((f) => f.faixa.replace("-", "–")),
      datasets: [{
        data: g.envelhecimento.map((f) => f.quantidade),
        backgroundColor: g.envelhecimento.map((f) => f.cor),
        borderRadius: 5, barPercentage: .6,
      }],
    },
    options: {
      ...opcoesBase,
      scales: { x: eixoRotulo, y: { ...eixoValor, ticks: { ...eixoValor.ticks, precision: 0 } } },
    },
  };

  const quantas = desktop ? 10 : 7;
  const categorias = {
    type: "bar" as const,
    data: {
      labels: g.custoPorCategoria.slice(0, quantas).map((c) => c.categoria),
      datasets: [{
        data: g.custoPorCategoria.slice(0, quantas).map((c) => c.valor / 100),
        backgroundColor: "#4A524F", borderRadius: 3, barThickness: 13,
      }],
    },
    options: {
      ...opcoesBase,
      indexAxis: "y" as const,
      scales: {
        x: { ...eixoValor, ticks: { ...eixoValor.ticks, callback: emMil } },
        y: eixoRotulo,
      },
    },
  };

  if (!desktop) return { envelhecimento, categorias };

  // Barras de lucro com a linha de quantidade por cima, em eixo próprio.
  const porMes = {
    type: "bar" as const,
    data: {
      labels: g.resultadoPorMes.map((m) => m.mes.split("-").reverse().join("/")),
      datasets: [
        {
          type: "bar" as const, label: "Lucro",
          data: g.resultadoPorMes.map((m) => m.lucro / 100),
          backgroundColor: "#2A8466", borderRadius: 4, yAxisID: "y",
        },
        {
          type: "line" as const, label: "Carros",
          data: g.resultadoPorMes.map((m) => m.quantidade),
          borderColor: "#0032D3", backgroundColor: "#0032D3",
          borderWidth: 2, tension: .3, pointRadius: 3, yAxisID: "y2",
        },
      ],
    },
    options: {
      ...opcoesBase,
      scales: {
        x: eixoRotulo,
        y: { ...eixoValor, ticks: { ...eixoValor.ticks, callback: emMil } },
        y2: {
          position: "right" as const, grid: { display: false }, border: { display: false },
          ticks: { ...eixoValor.ticks, precision: 0 }, suggestedMax: 4,
        },
      },
    },
  };

  const dispersao = {
    type: "scatter" as const,
    data: {
      datasets: [{
        data: g.retornoPorCiclo.map((v) => ({ x: v.ciclo, y: v.retorno, codigo: v.codigo })),
        backgroundColor: g.retornoPorCiclo.map((v) => (v.retorno > 0 ? "#2A8466" : "#B94B45")),
        pointRadius: 6, pointHoverRadius: 8,
      }],
    },
    options: {
      ...opcoesBase,
      plugins: {
        ...opcoesBase.plugins,
        tooltip: {
          ...opcoesBase.plugins.tooltip,
          callbacks: {
            label: (item: { raw: unknown }) => {
              const p = item.raw as { x: number; y: number; codigo: string };
              return `${p.codigo} · ${p.x} dias · ${p.y.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: { ...eixoValor, title: { display: true, text: "dias até vender", color: "#858B87" } },
        y: {
          ...eixoValor,
          ticks: { ...eixoValor.ticks, callback: (n: unknown) => `${n}%` },
        },
      },
    },
  };

  const contraFipe = {
    type: "bar" as const,
    data: {
      labels: g.anuncioVsFipe.map((v) => v.codigo),
      datasets: [{
        data: g.anuncioVsFipe.map((v) => v.variacao),
        backgroundColor: g.anuncioVsFipe.map((v) => (v.variacao >= 0 ? "#2A8466" : "#D89A2B")),
        borderRadius: 3, barThickness: 13,
      }],
    },
    options: {
      ...opcoesBase,
      indexAxis: "y" as const,
      scales: {
        x: {
          ...eixoValor,
          ticks: { ...eixoValor.ticks, callback: (n: unknown) => `${Number(n).toFixed(0)}%` },
        },
        y: eixoRotulo,
      },
    },
  };

  const porMarca = {
    type: "bar" as const,
    data: {
      labels: g.retornoPorMarca.map((m) => m.marca),
      datasets: [{
        data: g.retornoPorMarca.map((m) => m.retorno),
        backgroundColor: g.retornoPorMarca.map((m) => (m.retorno >= 0 ? "#2A8466" : "#B94B45")),
        borderRadius: 3, barThickness: 13,
      }],
    },
    options: {
      ...opcoesBase,
      indexAxis: "y" as const,
      scales: {
        x: {
          ...eixoValor,
          ticks: { ...eixoValor.ticks, callback: (n: unknown) => `${Number(n).toFixed(0)}%` },
        },
        y: eixoRotulo,
      },
    },
  };

  return { envelhecimento, categorias, porMes, dispersao, contraFipe, porMarca };
}

export function Painel({ versao, recorte }: { versao: number; recorte: string }) {
  const desktop = useDesktop();
  const { dados, erro, carregando } = useDados(
    () => api.painel(recorte), `${versao}|${recorte}|${desktop}`);

  const g = useMemo(() => (dados ? graficos(dados, desktop) : null), [dados, desktop]);

  if (erro) return <Vazio>{erro}</Vazio>;
  if (carregando && !dados) return <Carregando />;
  if (!dados || !g) return null;

  const { patrimonio: p, indicadores: i } = dados;
  const pcCaixa = p.patrimonioTotal ? (p.caixaTotal / p.patrimonioTotal) * 100 : 0;

  return (
    <>
      <div className="card">
        <h3>Patrimônio</h3>
        <p className="hint">Dinheiro em conta e carros no pátio.</p>

        <div className="pat-bar">
          <div className="b-caixa" style={{ width: `${pcCaixa}%` }} />
          <div className="b-estoque" style={{ width: `${100 - pcCaixa}%` }} />
        </div>
        <div className="pat-l">
          <span><i className="dot d-caixa" />Caixa {pcCaixa.toFixed(0)}%</span>
          <span><i className="dot d-estoque" />Estoque {(100 - pcCaixa).toFixed(0)}%</span>
        </div>

        <div className="pat-grid">
          <div className="pat-lab topo">Hoje</div>
          <div className="pat-cel forte">
            <span>Patrimônio total</span><b>{brl(p.patrimonioTotal)}</b>
          </div>
          <div className="pat-cel">
            <span><i className="dot d-estoque" />Estoque ao custo</span><b>{brl(p.estoqueCusto)}</b>
          </div>
          <div className="pat-cel">
            <span><i className="dot d-caixa" />Caixa disponível</span><b>{brl(p.caixaTotal)}</b>
          </div>
        </div>

        <div className="pat-grid pat-proj">
          <div className="pat-lab">Se todo o estoque sair pelo preço de anúncio</div>
          <div className="pat-cel forte">
            <span>Patrimônio futuro</span><b>{brl(p.patrimonioFuturo)}</b>
          </div>
          <div className="pat-cel">
            <span><i className="dot d-estoque" />Estoque a preço de anúncio</span>
            <b>{brl(p.estoqueAnuncio)}</b>
          </div>
          <div className="pat-cel ganho">
            <span>Lucro não realizado</span><b>+ {brl(p.lucroNaoRealizado)}</b>
          </div>
        </div>

        <p className="hint" style={{ marginTop: 16 }}>
          A linha de baixo é projeção, não resultado: supõe venda pelo preço pedido,
          sem desconto no fechamento e sem novos custos até lá.
        </p>

        {/* O caixa não é filtrado — dinheiro em conta não tem marca. */}
        {dados.recorteAtivo && (
          <p className="hint" style={{ marginTop: 8, color: "var(--ambar)" }}>
            Há filtro em vigor: o estoque acima é só o do recorte, mas o caixa é o total.
          </p>
        )}
      </div>

      <div className="sec-t">Operação</div>
      <div className="kpis">
        <div className="kpi"><span>Em estoque</span><b>{i.emEstoque}</b><i>veículos no pátio</i></div>
        <div className="kpi">
          <span>Capital imobilizado</span><b>{brl(i.capitalImobilizado)}</b><i>parado no pátio</i>
        </div>
        <div className="kpi"><span>Giro médio</span><b>{i.giroMedio}d</b><i>compra até venda</i></div>
        <div className="kpi">
          <span>Retorno médio</span><b className="pos">{pct(i.retornoMedio)}</b><i>sobre o investido</i>
        </div>
        <div className="kpi">
          <span>Lucro realizado</span>
          <b className="pos">{brl(i.lucroRealizado)}</b>
          <i>{dados.graficos.retornoPorCiclo.length} vendas</i>
        </div>
        <div className={`kpi${i.parados90 ? " alerta" : ""}`}>
          <span>Parados +90d</span><b>{i.parados90}</b>
          <i>{i.parados90 ? "consomem margem" : "nenhum"}</i>
        </div>
        {!desktop && (
          <div className="kpi"><span>Em garantia</span><b>{i.emGarantia}</b><i>ainda com exposição</i></div>
        )}
      </div>

      {desktop ? (
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="card">
            <h3>Envelhecimento do estoque</h3>
            <p className="hint">
              Veículos parados por faixa de dias. Acima de 90 dias, o carro consome margem.
            </p>
            <Grafico config={g.envelhecimento} />
          </div>
          <div className="card">
            <h3>Resultado por mês</h3>
            <p className="hint">Lucro realizado e número de carros vendidos.</p>
            <Grafico config={g.porMes!} />
          </div>
          <div className="card">
            <h3>Retorno × ciclo de venda</h3>
            <p className="hint">
              Cada ponto é um carro vendido. Quanto mais à direita e mais baixo, pior o negócio.
            </p>
            <Grafico config={g.dispersao!} />
          </div>
          <div className="card">
            <h3>Custo por categoria</h3>
            <p className="hint">
              Todos os gastos fora a compra do carro, inclusive comissões e retornos.
            </p>
            <Grafico config={g.categorias} />
          </div>
          <div className="card">
            <h3>Anúncio contra a Fipe</h3>
            <p className="hint">Quanto o preço pedido está acima ou abaixo da tabela.</p>
            <Grafico config={g.contraFipe!} />
          </div>
          <div className="card">
            <h3>Retorno médio por marca</h3>
            <p className="hint">Sobre o investido, considerando só os carros já vendidos.</p>
            <Grafico config={g.porMarca!} />
          </div>
        </div>
      ) : (
        <>
          <div className="sec-t">Envelhecimento do estoque</div>
          <div className="card"><Grafico config={g.envelhecimento} /></div>

          <div className="sec-t">Onde o dinheiro foi</div>
          <div className="card">
            <p className="hint" style={{ margin: "0 0 4px" }}>
              Maiores categorias de custo, fora a compra do carro.
            </p>
            <Grafico config={g.categorias} altura={210} />
          </div>
        </>
      )}
    </>
  );
}
