/**
 * Ficha do veículo — §6.5, na ordem exata de blocos que a especificação fixa.
 *
 * A análise financeira segue o desenho da §6.5: dois grupos com título, cada
 * linha com o sinal (−, +, =), custo total em faixa cinza e resultado em faixa
 * verde ou vermelha. É o bloco que explica o número em vez de só mostrá-lo.
 */

import { useMemo } from "react";
import { api, type Ficha as DadosFicha } from "../api.js";
import { Carregando, Placa, Pilula, Vazio } from "../componentes/basicos.js";
import { Grafico, eixoRotulo, eixoValor, opcoesBase } from "../componentes/Grafico.js";
import { useDados } from "../dados.js";
import { brl, dataBr, pct } from "../formato.js";
import { rotuloDoTipo } from "../tipos.js";

interface Props {
  id: string;
  versao: number;
  aoVoltar: () => void;
  aoAbrirOutro: (id: string) => void;
  aoEditar: (v: DadosFicha) => void;
  aoExcluir: (v: DadosFicha) => void;
  aoVender: (v: DadosFicha) => void;
  aoLancarCusto: (v: DadosFicha) => void;
  aoAtualizarFipe: (v: DadosFicha) => void;
  aoRemoverCusto: (custo: DadosFicha["custos"][number]) => void;
}

export function Ficha(p: Props) {
  const { dados: v, erro, carregando } = useDados(() => api.ficha(p.id), p.versao);

  const grafico = useMemo(() => {
    if (!v || v.custoPorCategoria.length === 0) return null;
    return {
      type: "bar" as const,
      data: {
        labels: v.custoPorCategoria.map((c) => c.categoria),
        datasets: [{
          data: v.custoPorCategoria.map((c) => c.valor / 100),
          backgroundColor: "#2A8466", borderRadius: 3, barThickness: 11,
        }],
      },
      options: {
        ...opcoesBase,
        indexAxis: "y" as const,
        scales: {
          x: {
            ...eixoValor,
            ticks: { ...eixoValor.ticks, callback: (n: unknown) => `R$ ${(Number(n) / 1000).toFixed(1)}k` },
          },
          y: eixoRotulo,
        },
      },
    };
  }, [v]);

  if (erro) return <Vazio>{erro}</Vazio>;
  if (carregando && !v) return <Carregando />;
  if (!v) return null;

  return (
    <>
      <button className="voltar" onClick={p.aoVoltar}>← Voltar</button>

      {/* 1. cabeçalho e ficha técnica */}
      <div className="ficha-head">
        <div className="ficha-topo">
          <div>
            <div className="ficha-cod">{v.codigo}</div>
            <h2>{v.marca} {v.modelo}</h2>
            {v.versao && <div className="carro-meta">{v.versao}</div>}
            <div style={{ marginTop: 9 }}>
              <Pilula tipo={v.vendido ? "ok" : "gar"}>{v.vendido ? "Vendido" : "Disponível"}</Pilula>
            </div>
          </div>
          <Placa numero={v.placa} grande />
        </div>

        <div className="acoes-ficha">
          <button className="btn-sec" onClick={() => p.aoEditar(v)}>Editar</button>
          <button className="btn-sec perigo" onClick={() => p.aoExcluir(v)}>Excluir</button>
        </div>

        {/* 2. linha do tempo, no grid de especificações */}
        <div className="spec">
          <div><span>Tipo</span><b>{rotuloDoTipo(v.tipo)}</b></div>
          <div><span>Ano</span><b>{v.ano ?? "—"}</b></div>
          <div><span>Cor</span><b>{v.cor}</b></div>
          <div><span>Km</span><b className="num">{v.km ? v.km.toLocaleString("pt-BR") : "—"}</b></div>
          <div><span>Compra</span><b className="num">{dataBr(v.dataCompra)}</b></div>
          <div>
            <span>{v.vendido ? "Venda" : "Em pátio"}</span>
            <b className="num">{v.vendido ? dataBr(v.dataVenda) : `${v.cicloDias}d`}</b>
          </div>
          <div><span>Ciclo</span><b className="num">{v.cicloDias}d</b></div>
        </div>
      </div>

      {/* 3. vínculo de troca, nos dois sentidos */}
      {v.troca.saiu && (
        <div className="link-troca">
          Entrou na troca da venda do <b>{v.troca.saiu.descricao}</b>
          {v.troca.avaliacao !== null && <>, avaliado em <b>{brl(v.troca.avaliacao)}</b></>}
          {v.troca.agio !== null && v.troca.agio > 0 && <> · ágio de <b>{brl(v.troca.agio)}</b></>}.
          <button onClick={() => p.aoAbrirOutro(v.troca.saiu!.id)}>Ver a venda</button>
        </div>
      )}
      {v.troca.entrou && (
        <div className="link-troca">
          Nesta venda entrou um <b>{v.troca.entrou.descricao}</b> na troca.
          <button onClick={() => p.aoAbrirOutro(v.troca.entrou!.id)}>Ver o carro</button>
        </div>
      )}

      {/* 4. garantia, ou o botão de vender */}
      {v.garantia ? (
        <div className="card">
          <div className="entre">
            <h3 style={{ fontSize: 14.5 }}>Garantia de 3 meses</h3>
            <Pilula tipo={v.garantia.ativa ? "gar" : "ok"}>
              {v.garantia.ativa ? "Em garantia" : "Encerrada"}
            </Pilula>
          </div>
          <div className="gar-track">
            <div
              className={`gar-fill ${v.garantia.ativa ? "gfill" : "gfim"}`}
              style={{ width: `${v.garantia.preenchimento}%` }}
            />
          </div>
          <div className="entre" style={{ fontSize: 12.5, color: "var(--ink2)" }}>
            <span>
              {v.garantia.ativa
                ? <>Faltam <b className="num">{v.garantia.diasRestantes} dias</b></>
                : `Encerrou há ${Math.abs(v.garantia.diasRestantes)} dias`}
            </span>
            <span>Até {dataBr(v.garantia.fim)}</span>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Janela em que retornos do comprador ainda são por sua conta.
          </p>
        </div>
      ) : (
        <button className="btn" style={{ marginBottom: 11 }} onClick={() => p.aoVender(v)}>
          Marcar como vendido
        </button>
      )}

      {/* 5. análise financeira */}
      <div className="card">
        <h3>Análise financeira</h3>

        <div className="bloco-t">O que o carro custou</div>
        <ul className="rows">
          <li>
            <span><span className="sign">−</span>Valor de compra</span>
            <b>{brl(v.valorCompra)}</b>
          </li>
          <li>
            <span><span className="sign">−</span>Custos lançados · {v.lancamentos}</span>
            <b>{brl(v.custoPreparacao)}</b>
          </li>
          <li className="sum">
            <span><span className="sign">=</span>Custo total</span>
            <b>{brl(v.custoTotal)}</b>
          </li>
        </ul>

        <div className="bloco-t">
          {v.vendido ? "O que o carro rendeu" : "O que o carro pode render"}
        </div>
        <ul className="rows">
          {v.vendido ? (
            <>
              <li>
                <span><span className="sign">+</span>Valor de venda</span>
                <b>{brl(v.valorVenda ?? 0)}</b>
              </li>
              {v.retornoMes !== null && (
                <li>
                  <span><span className="sign" />Retorno por mês</span>
                  <b>{pct(v.retornoMes, 2)}</b>
                </li>
              )}
              <li className={`fim${(v.lucro ?? 0) <= 0 ? " ruim" : ""}`}>
                <span>Lucro · {pct(v.retornoPct ?? 0)}</span>
                <b>{brl(v.lucro ?? 0)}</b>
              </li>
            </>
          ) : v.valorAnuncio !== null ? (
            <>
              <li>
                <span><span className="sign">+</span>Valor de anúncio</span>
                <b>{brl(v.valorAnuncio)}</b>
              </li>
              <li className={`fim${(v.lucroProjetado ?? 0) <= 0 ? " ruim" : ""}`}>
                <span>Projetado · {pct(v.projetadoPct ?? 0)}</span>
                <b>{brl(v.lucroProjetado ?? 0)}</b>
              </li>
            </>
          ) : (
            <li><span>Sem valor de anúncio definido</span><b>—</b></li>
          )}
        </ul>
      </div>

      {/* 6. referência Fipe */}
      <div className="card">
        <div className="entre base">
          <h3>Referência Fipe</h3>
          <button className="acao-linha" onClick={() => p.aoAtualizarFipe(v)}>Atualizar</button>
        </div>
        <ul className="rows" style={{ marginTop: 8 }}>
          <li><span>Fipe na compra</span><b>{v.fipeCompra ? brl(v.fipeCompra) : "—"}</b></li>
          <li><span>Fipe hoje</span><b>{v.fipeHoje ? brl(v.fipeHoje) : "—"}</b></li>
          <li>
            <span>Depreciação</span>
            <b className={v.depreciacao === null ? "" : v.depreciacao < 0 ? "neg" : "pos"}>
              {v.depreciacao === null
                ? "—"
                : `${v.depreciacao > 0 ? "+ " : "− "}${brl(Math.abs(v.depreciacao))}`}
            </b>
          </li>
          <li>
            <span>Anúncio vs Fipe</span>
            <b className={v.anuncioVsFipe !== null && v.anuncioVsFipe < 0 ? "neg" : ""}>
              {v.anuncioVsFipe === null
                ? "—"
                : `${v.anuncioVsFipe > 0 ? "+" : ""}${pct(v.anuncioVsFipe)}`}
            </b>
          </li>
        </ul>
      </div>

      {/* 7. custos lançados */}
      <div className="card">
        <div className="entre base">
          <h3>Custos lançados</h3>
          <button className="acao-linha" onClick={() => p.aoLancarCusto(v)}>+ Lançar</button>
        </div>
        <p className="hint" style={{ marginBottom: 8 }}>
          Cada gasto do veículo, com data. É daqui que sai o custo total.
        </p>

        {v.custos.length === 0 ? (
          <Vazio>Nenhum custo lançado.</Vazio>
        ) : (
          <>
            {v.custos.map((c) => (
              <div key={c.id} className="custo-li">
                <div>
                  <div className="cn">{c.descricao}</div>
                  <div className="cm">{c.categoria} · {c.prevista ? "prevista" : dataBr(c.data)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <b>{brl(c.valor)}</b>
                  <button
                    className="remover" aria-label={`Remover ${c.descricao}`}
                    onClick={() => p.aoRemoverCusto(c)}
                  >×</button>
                </div>
              </div>
            ))}
            <div className="pat-linha tot" style={{ marginTop: 10 }}>
              <span>Total em {v.lancamentos} {v.lancamentos === 1 ? "lançamento" : "lançamentos"}</span>
              <b>{brl(v.custoPreparacao)}</b>
            </div>
          </>
        )}
      </div>

      {/* 8. custo por categoria, papel secundário */}
      {grafico && (
        <div className="card">
          <div className="bloco-t" style={{ marginTop: 0 }}>Custo por categoria</div>
          <Grafico config={grafico} altura={Math.max(120, v.custoPorCategoria.length * 26)} />
        </div>
      )}
    </>
  );
}
