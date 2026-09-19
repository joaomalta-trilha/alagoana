/**
 * Despesas da empresa — pedido pela loja em 16/09/2026.
 *
 * "Gastos que existem mesmo com o pátio vazio. Custo ligado a um carro
 * continua sendo lançado na ficha do veículo." As duas coisas não se
 * misturam em relatório nenhum — aqui não há nenhum número de lucro por
 * carro, só o que a empresa gastou.
 *
 * Rodada 1: só o registro. Sem job de recorrência, sem resultado do mês, sem
 * ponto de equilíbrio — isso fica para a rodada 2, que é também por que
 * `status` nasce da data em vez de um campo na tela (ver `dominio/despesa.ts`
 * no backend).
 */

import { useState } from "react";
import { api, type ContaDoPlano, type Despesa } from "../api.js";
import { Carregando, Pilula, Vazio } from "../componentes/basicos.js";
import { useDados } from "../dados.js";
import { brl, dataBr, hojeISO } from "../formato.js";

interface Props {
  versao: number;
  plano: ContaDoPlano[];
  aoNovaDespesa: () => void;
  aoExcluir: (despesa: Despesa) => void;
  aoAtualizar: () => void;
}

export function Despesas({ versao, plano, aoNovaDespesa, aoExcluir, aoAtualizar }: Props) {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [grupo, setGrupo] = useState("");
  const [status, setStatus] = useState<"" | "pago" | "previsto">("");
  const [verPlano, setVerPlano] = useState(false);

  const { dados: despesas, erro, carregando } = useDados(
    () => api.despesas({ mes, ...(grupo ? { grupo: Number(grupo) } : {}), ...(status ? { status } : {}) }),
    `${versao}|${mes}|${grupo}|${status}`,
  );

  if (erro) return <Vazio>{erro}</Vazio>;

  const grupos = [...new Map(plano.map((p) => [p.grupoCodigo, p.grupoNome]))]
    .sort(([a], [b]) => a - b);

  async function alternar(id: string, ativa: boolean) {
    await api.alternarConta(id, ativa);
    aoAtualizar();
  }

  return (
    <>
      <div className="cab-despesas">
        <h2>{verPlano ? "Plano de contas" : "Despesas"}</h2>
        <div className="cab-acoes">
          <button className="btn-mini" onClick={() => setVerPlano((v) => !v)}>
            {verPlano ? "← Lançamentos" : "Plano de contas"}
          </button>
          {!verPlano && (
            <button className="btn-mini pri" onClick={aoNovaDespesa}>+ Nova despesa</button>
          )}
        </div>
      </div>

      {verPlano ? (
        <PlanoDeContas plano={plano} aoAlternar={alternar} />
      ) : (
        <>
          <div className="filtros-despesas">
            <input
              type="month" aria-label="Mês" value={mes}
              onChange={(e) => setMes(e.target.value)}
            />
            <select aria-label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              <option value="">Todos os grupos</option>
              {grupos.map(([codigo, nome]) => (
                <option key={codigo} value={codigo}>{codigo} · {nome}</option>
              ))}
            </select>
            <select
              aria-label="Status" value={status}
              onChange={(e) => setStatus(e.target.value as "" | "pago" | "previsto")}
            >
              <option value="">Pagas e previstas</option>
              <option value="pago">Só pagas</option>
              <option value="previsto">Só previstas</option>
            </select>
          </div>

          {carregando && !despesas ? <Carregando /> : (
            <div className="card">
              {!despesas || despesas.length === 0 ? (
                <Vazio>Nenhuma despesa lançada neste recorte.</Vazio>
              ) : despesas.map((d) => (
                <div key={d.id} className="custo-li">
                  <div>
                    <div className="cn">{d.descricao}</div>
                    <div className="cm">
                      {dataBr(d.dataPagamento)} · {d.planoConta.codigo} {d.planoConta.nome} · {d.contaSaida.nome}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Pilula tipo={d.status === "pago" ? "ok" : "gar"}>{d.status}</Pilula>
                    <b>{brl(d.valor)}</b>
                    <button
                      className="remover" aria-label={`Remover ${d.descricao}`}
                      onClick={() => aoExcluir(d)}
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function PlanoDeContas(
  { plano, aoAlternar }: { plano: ContaDoPlano[]; aoAlternar: (id: string, ativa: boolean) => void },
) {
  const grupos = [...new Map(plano.map((p) => [p.grupoCodigo, p.grupoNome]))]
    .sort(([a], [b]) => a - b);

  return (
    <div className="card">
      <p className="hint" style={{ margin: "0 0 8px" }}>
        Conta desativada some do formulário de nova despesa, mas o que já foi lançado com ela
        continua na lista.
      </p>
      {grupos.map(([codigo, nome]) => (
        <div key={codigo}>
          <div className="bloco-t">{codigo} · {nome}</div>
          {plano.filter((p) => p.grupoCodigo === codigo).map((p) => (
            <label key={p.id} className="custo-li" style={{ cursor: "pointer" }}>
              <div>
                <div className="cn">{p.codigo} · {p.nome}</div>
                <div className="cm">{p.natureza}</div>
              </div>
              <input
                type="checkbox" checked={p.ativa}
                onChange={(e) => aoAlternar(p.id, e.target.checked)}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
