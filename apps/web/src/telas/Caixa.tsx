/**
 * Caixa — §6.6.
 *
 * "Cartões de saldo por conta, mais o consolidado em destaque azul. Botão
 * 'Registrar aporte'. Extrato com data, descrição, tipo, conta e valor com
 * sinal e cor."
 *
 * O quadro de capital por sócio é o acréscimo da v1 que a §6.6 pede e o
 * protótipo não tem: saldo em mãos e capital acumulado são números diferentes,
 * e ambos importam (§3.6).
 */

import { api } from "../api.js";
import { Carregando, Vazio } from "../componentes/basicos.js";
import { useDados } from "../dados.js";
import { brl, dataBr } from "../formato.js";

export function Caixa({ versao, aoAportar }: { versao: number; aoAportar: () => void }) {
  const { dados, erro, carregando } = useDados(() => api.caixa(), versao);

  if (erro) return <Vazio>{erro}</Vazio>;
  if (carregando && !dados) return <Carregando />;
  if (!dados) return null;

  const comCapital = dados.capitalPorSocio.filter((s) => s.aportes > 0 || s.retiradas > 0);

  return (
    <>
      <div className="cx total">
        <div>
          <div className="cxt">Consolidado</div>
          <div className="cxn">Caixa total</div>
        </div>
        <b>{brl(dados.total)}</b>
      </div>

      {dados.contas.map((c) => (
        <div key={c.id} className={`cx${c.saldo === 0 ? " zero" : ""}`}>
          <div>
            <div className="cxt">{c.tipo}</div>
            <div className="cxn">{c.nome}</div>
          </div>
          <b>{brl(c.saldo)}</b>
        </div>
      ))}

      <button className="btn" style={{ margin: "14px 0" }} onClick={aoAportar}>
        Registrar aporte
      </button>

      {comCapital.length > 0 && (
        <>
          <div className="sec-t">Capital por sócio</div>
          <div className="card">
            <p className="hint" style={{ margin: "0 0 8px" }}>
              Entrada e saída de capital dos sócios. Não é o mesmo que o saldo em mãos.
            </p>
            {comCapital.map((s) => (
              <div key={s.socioId} className="custo-li">
                <div>
                  <div className="cn">{s.nome}</div>
                  <div className="cm">
                    {brl(s.aportes)} aportados · {brl(s.retiradas)} retirados
                  </div>
                </div>
                <b>{brl(s.capital)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sec-t">Extrato</div>
      <div className="card">
        {dados.extrato.length === 0
          ? (
            <Vazio>
              Nenhuma movimentação ainda.<br />
              Os saldos acima são a posição de hoje.
            </Vazio>
          )
          : dados.extrato.map((m) => (
            <div key={m.id} className="custo-li">
              <div>
                <div className="cn">{m.descricao}</div>
                <div className="cm">
                  {dataBr(m.data)} · {m.conta}{m.veiculo ? ` · ${m.veiculo}` : ""}
                </div>
              </div>
              <b className={m.valor >= 0 ? "pos" : "neg"}>
                {m.valor >= 0 ? "+ " : "− "}{brl(Math.abs(m.valor))}
              </b>
            </div>
          ))}
      </div>
    </>
  );
}
