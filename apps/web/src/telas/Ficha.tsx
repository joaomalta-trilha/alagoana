/**
 * Ficha do veículo — §6.5, na ordem exata de blocos que a especificação fixa.
 *
 * A análise financeira segue o desenho da §6.5: dois grupos com título, cada
 * linha com o sinal (−, +, =), custo total em faixa cinza e resultado em faixa
 * verde ou vermelha. É o bloco que explica o número em vez de só mostrá-lo.
 *
 * Celular e desktop dividem os dados e as regras, mas não o arranjo — os dois
 * protótipos discordam de propósito, e por muito tempo esta tela seguiu só o
 * do celular, empilhando tudo em uma coluna mesmo com 1280px de largura. No
 * desktop a placa sobe para uma coluna própria, as datas saem para a linha do
 * tempo (bloco 2 da §6.5, que não existia), a análise e a Fipe ficam lado a
 * lado e os custos viram tabela. Onde muda só o espaçamento, quem decide é a
 * media query; `useDesktop()` fica para onde muda a estrutura.
 */

import { useMemo, type ReactNode } from "react";
import { api, type Ficha as DadosFicha } from "../api.js";
import { Carregando, Placa, Pilula, Vazio } from "../componentes/basicos.js";
import { Grafico, eixoRotulo, eixoValor, opcoesBase } from "../componentes/Grafico.js";
import { useDados } from "../dados.js";
import { brl, dataBr, pct } from "../formato.js";
import { useDesktop } from "../tela.js";
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
  aoDesfazerVenda: (v: DadosFicha) => void;
}

/** Título de cartão com a ação à direita — o `card-head` do protótipo. */
function TituloComAcao(
  { titulo, hint, children }: { titulo: string; hint?: string; children?: ReactNode },
) {
  return (
    <div className="card-head">
      <div>
        <h3>{titulo}</h3>
        {hint && <p className="hint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Sinal e classe da depreciação e da variação, que andam juntas. */
function classeFipe(valor: number | null): string {
  if (valor === null) return "";
  return valor < 0 ? "neg" : "pos";
}

export function Ficha(p: Props) {
  const desktop = useDesktop();
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

  // "Disponível" é âmbar no celular e azul no desktop — os dois protótipos
  // pedem cores diferentes, e no desktop o âmbar competiria com a pílula de
  // garantia logo abaixo, que é a mesma cor e quer dizer outra coisa.
  const situacao = (
    <Pilula tipo={v.vendido ? "ok" : desktop ? "estoque" : "gar"}>
      {v.vendido ? "Vendido" : "Disponível"}
    </Pilula>
  );
  const acoes = (
    <div className="acoes-ficha">
      <button className="btn-sec" onClick={() => p.aoEditar(v)}>Editar</button>
      <button className="btn-sec perigo" onClick={() => p.aoExcluir(v)}>Excluir</button>
    </div>
  );

  // ------------------------------------------------- 1. cabeçalho e ficha técnica
  const cabecalho = desktop ? (
    <div className="ficha-head">
      <div>
        <Placa numero={v.placa} grande />
        <div style={{ marginTop: 12 }}>{situacao}</div>
      </div>
      <div className="ficha-topo">
        <div className="ficha-identidade">
          <div className="ficha-cod">{v.codigo}</div>
          {acoes}
        </div>
        <h2>{v.marca} {v.modelo}</h2>
        <div className="spec">
          <div><span>Tipo</span><b>{rotuloDoTipo(v.tipo)}</b></div>
          <div><span>Marca</span><b>{v.marca}</b></div>
          <div><span>Modelo</span><b>{v.modelo}</b></div>
          {v.versao && <div><span>Versão</span><b>{v.versao}</b></div>}
          <div><span>Ano</span><b>{v.ano ?? "—"}</b></div>
          <div><span>Km</span><b className="num">{v.km ? v.km.toLocaleString("pt-BR") : "—"}</b></div>
          <div><span>Cor</span><b>{v.cor}</b></div>
          <div><span>Placa</span><b className="num">{v.placa}</b></div>
        </div>
      </div>
    </div>
  ) : (
    <div className="ficha-head">
      <div className="ficha-topo">
        <div>
          <div className="ficha-cod">{v.codigo}</div>
          <h2>{v.marca} {v.modelo}</h2>
          {v.versao && <div className="carro-meta">{v.versao}</div>}
          <div style={{ marginTop: 9 }}>{situacao}</div>
        </div>
        <Placa numero={v.placa} grande />
      </div>

      {acoes}

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
  );

  // --------------------------------------------------------- 5. análise financeira
  // Insumo em cinza, resultado em preto: no desktop o protótipo separa os dois
  // pela cor, e sem isso o custo total não salta da linha de cima.
  const fraco = desktop ? "fraco" : "";
  const analise = (
    <>
      <div className="bloco-t">O que o carro custou</div>
      <ul className="rows">
        <li className={fraco}>
          <span><span className="sign">−</span>Valor de compra</span>
          <b>{brl(v.valorCompra)}</b>
        </li>
        <li className={fraco}>
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
            {/* O desconto no fechamento só cabe onde há largura para a frase
                inteira; no celular ele empurraria o lucro para fora da dobra. */}
            {desktop && v.descontoFechamento !== null && (
              <li className={fraco}>
                <span>
                  <span className="sign">{v.descontoFechamento < 0 ? "−" : "+"}</span>
                  Desconto no fechamento
                </span>
                <b>{brl(Math.abs(v.descontoFechamento))}</b>
              </li>
            )}
            {v.retornoMes !== null && (
              <li className={fraco}>
                <span><span className="sign" />{desktop ? "Retorno por mês em pátio" : "Retorno por mês"}</span>
                <b>{pct(v.retornoMes, 2)}</b>
              </li>
            )}
            <li className={`fim${(v.lucro ?? 0) <= 0 ? " ruim" : ""}`}>
              {desktop ? (
                <>
                  <span><span className="sign">=</span>Lucro · retorno sobre o investido</span>
                  <b>{brl(v.lucro ?? 0)} · {pct(v.retornoPct ?? 0)}</b>
                </>
              ) : (
                <>
                  <span>Lucro · {pct(v.retornoPct ?? 0)}</span>
                  <b>{brl(v.lucro ?? 0)}</b>
                </>
              )}
            </li>
          </>
        ) : v.valorAnuncio !== null ? (
          <>
            <li>
              <span><span className="sign">+</span>Valor de anúncio</span>
              <b>{brl(v.valorAnuncio)}</b>
            </li>
            <li className={`fim${(v.lucroProjetado ?? 0) <= 0 ? " ruim" : ""}`}>
              {desktop ? (
                <>
                  <span><span className="sign">=</span>Margem projetada</span>
                  <b>{brl(v.lucroProjetado ?? 0)} · {pct(v.projetadoPct ?? 0)}</b>
                </>
              ) : (
                <>
                  <span>Projetado · {pct(v.projetadoPct ?? 0)}</span>
                  <b>{brl(v.lucroProjetado ?? 0)}</b>
                </>
              )}
            </li>
          </>
        ) : (
          <li><span>Sem valor de anúncio definido</span><b>—</b></li>
        )}
      </ul>
    </>
  );

  // ------------------------------------------------------------- 6. referência Fipe
  const notaFipe = v.depreciacao === null
    ? "Preencha a Fipe para acompanhar a depreciação do carro enquanto ele está parado."
    : (v.depreciacao === 0
      ? "A tabela não mudou desde a compra."
      : `A tabela ${v.depreciacao < 0 ? "caiu" : "subiu"} ${brl(Math.abs(v.depreciacao))} desde a compra. ` +
        "Isso é mercado, não entra na margem.") +
      (v.anuncioVsFipe === null
        ? ""
        : ` Anúncio está ${v.anuncioVsFipe > 0 ? "+" : ""}${pct(v.anuncioVsFipe)} em relação a ela.`);

  const fipe = desktop ? (
    <div className="card">
      <TituloComAcao titulo="Referência Fipe" hint="Preenchida à mão. Atualize quando a tabela virar o mês.">
        <button className="btn-sec" onClick={() => p.aoAtualizarFipe(v)}>Atualizar valores</button>
      </TituloComAcao>
      <div className="fipe-grid">
        <div><span>Fipe na compra</span><b>{v.fipeCompra ? brl(v.fipeCompra) : "—"}</b></div>
        <div><span>Fipe hoje</span><b>{v.fipeHoje ? brl(v.fipeHoje) : "—"}</b></div>
        <div>
          <span>Depreciação</span>
          <b className={classeFipe(v.depreciacao)}>
            {v.depreciacao === null
              ? "—"
              : `${v.depreciacao > 0 ? "+ " : "− "}${brl(Math.abs(v.depreciacao))}`}
          </b>
        </div>
        <div>
          <span>Variação</span>
          <b className={classeFipe(v.depreciacaoPct)}>
            {v.depreciacaoPct === null ? "—" : `${v.depreciacaoPct > 0 ? "+" : ""}${pct(v.depreciacaoPct)}`}
          </b>
        </div>
      </div>
      <p className="note">{notaFipe}</p>
    </div>
  ) : (
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
          <b className={classeFipe(v.depreciacao)}>
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
  );

  // ------------------------------------------------------- 8. custo por categoria
  const cartaoGrafico = grafico && (
    <div className="card" style={desktop ? { flex: 1, marginBottom: 0 } : undefined}>
      {desktop ? (
        <>
          <h3>Custo por categoria</h3>
          <p className="hint" style={{ marginBottom: 4 }}>
            Visão de análise. Total de {brl(v.custoPreparacao)} em preparação.
          </p>
        </>
      ) : (
        <div className="bloco-t" style={{ marginTop: 0 }}>Custo por categoria</div>
      )}
      <Grafico config={grafico} altura={Math.max(120, v.custoPorCategoria.length * 26)} />
    </div>
  );

  // ---------------------------------------------------------- 7. custos lançados
  const custos = desktop ? (
    <div className="card">
      <TituloComAcao
        titulo="Custos lançados"
        hint="Cada gasto do veículo, com data. É daqui que sai o custo total."
      >
        <button className="btn" onClick={() => p.aoLancarCusto(v)}>Lançar custo</button>
      </TituloComAcao>

      {v.custos.length === 0 ? (
        <Vazio>Nenhum custo lançado ainda. Comece pelo primeiro gasto do veículo.</Vazio>
      ) : (
        <table className="custos">
          <thead>
            <tr>
              <th>Descrição</th><th>Categoria</th><th>Data</th>
              <th className="dir">Valor</th><th />
            </tr>
          </thead>
          <tbody>
            {v.custos.map((c) => (
              <tr key={c.id}>
                <td>{c.descricao}</td>
                <td><span className="cat-tag">{c.categoria}</span></td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {c.prevista ? <span className="prevista">prevista</span> : dataBr(c.data)}
                </td>
                <td className="dir num">{brl(c.valor)}</td>
                <td className="dir">
                  <button
                    className="remover" aria-label={`Remover ${c.descricao}`}
                    onClick={() => p.aoRemoverCusto(c)}
                  >×</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total em preparação</td>
              <td className="dir num">{brl(v.custoPreparacao)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  ) : (
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
  );

  return (
    <>
      <button className="voltar" onClick={p.aoVoltar}>← Voltar</button>

      {cabecalho}

      {/* 2. linha do tempo — no celular estas datas moram na ficha técnica */}
      {desktop && (
        <div className="timeline">
          <div className="tl"><span>Data de compra</span><b>{dataBr(v.dataCompra)}</b></div>
          <div className="tl">
            <span>Último custo lançado</span>
            <b>{v.ultimoCusto ? dataBr(v.ultimoCusto) : "—"}</b>
          </div>
          <div className="tl">
            <span>Data de venda</span>
            <b>{v.vendido ? dataBr(v.dataVenda) : "—"}</b>
          </div>
          <div className="tl">
            <span>Ciclo {v.vendido ? "de venda" : "em pátio"}</span>
            <b>{v.cicloDias} dias</b>
          </div>
        </div>
      )}

      {/* 3. vínculo de troca, nos dois sentidos */}
      {v.troca.saiu && (
        <div className="link-troca">
          Entrou na troca da venda do <b>{v.troca.saiu.descricao}</b>
          {v.troca.avaliacao !== null && <>, avaliado em <b>{brl(v.troca.avaliacao)}</b></>}
          {v.troca.agio !== null && v.troca.agio > 0 && <> · ágio de <b>{brl(v.troca.agio)}</b></>}.
          <button onClick={() => p.aoAbrirOutro(v.troca.saiu!.id)}>Ver a venda</button>
        </div>
      )}
      {v.troca.entraram.length > 0 && (
        <div className="link-troca">
          {v.troca.entraram.length === 1
            ? <>Nesta venda entrou um <b>{v.troca.entraram[0]!.descricao}</b> na troca.</>
            : <>Nesta venda entraram <b>{v.troca.entraram.length} veículos</b> na troca.</>}
          {/* Um botão por carro: com dois ou mais, "Ver o carro" não diria qual. */}
          {v.troca.entraram.map((t) => (
            <button key={t.id} onClick={() => p.aoAbrirOutro(t.id)}>
              {v.troca.entraram.length === 1
                ? "Ver o carro"
                : `${t.descricao}${t.avaliacao === null ? "" : ` · ${brl(t.avaliacao)}`}`}
            </button>
          ))}
        </div>
      )}

      {/* 4. garantia, ou o convite a registrar a venda */}
      {v.garantia ? (
        <div className="card">
          {desktop ? (
            <TituloComAcao
              titulo="Garantia de 3 meses"
              hint="Janela em que retornos do comprador ainda são por sua conta."
            >
              <Pilula tipo={v.garantia.ativa ? "gar" : "ok"}>
                {v.garantia.ativa ? "Em garantia" : "Encerrada"}
              </Pilula>
            </TituloComAcao>
          ) : (
            <div className="entre">
              <h3 style={{ fontSize: 14.5 }}>Garantia de 3 meses</h3>
              <Pilula tipo={v.garantia.ativa ? "gar" : "ok"}>
                {v.garantia.ativa ? "Em garantia" : "Encerrada"}
              </Pilula>
            </div>
          )}
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
          {!desktop && (
            <p className="hint" style={{ marginTop: 10 }}>
              Janela em que retornos do comprador ainda são por sua conta.
            </p>
          )}

          <div className="desfazer-venda">
            <button className="acao-linha" onClick={() => p.aoDesfazerVenda(v)}>
              Desfazer a venda
            </button>
            <span className="hint">Devolve o carro ao estoque.</span>
          </div>
        </div>
      ) : desktop ? (
        <div className="card">
          <TituloComAcao
            titulo="Este carro ainda está no pátio"
            hint={`Há ${v.cicloDias} dias. Registre a venda quando ela acontecer.`}
          >
            <button className="btn" onClick={() => p.aoVender(v)}>Marcar como vendido</button>
          </TituloComAcao>
        </div>
      ) : (
        <button className="btn" style={{ marginBottom: 11 }} onClick={() => p.aoVender(v)}>
          Marcar como vendido
        </button>
      )}

      {/* 5, 6 e 8. no desktop a análise fica ao lado da Fipe e do gráfico */}
      {desktop ? (
        <div className="ficha-colunas" style={{ marginBottom: 14 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3>Análise financeira</h3>
            <p className="hint">Do pátio ao fechamento, sem misturar referência de mercado.</p>
            {analise}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {fipe}
            {cartaoGrafico}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>Análise financeira</h3>
            {analise}
          </div>
          {fipe}
        </>
      )}

      {custos}

      {!desktop && cartaoGrafico}
    </>
  );
}
