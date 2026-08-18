/**
 * Confirmação antes de apagar uma transferência entre contas.
 *
 * As duas pernas somem juntas — meia transferência é dinheiro sumindo ou
 * nascendo —, então a pergunta mostra o saldo em que cada conta fica. É a
 * mesma exigência da §4.8 para excluir: números reais, não um "tem certeza?".
 *
 * Quando o destino já gastou o dinheiro, o botão não existe: não adianta
 * oferecer uma ação que vai ser recusada.
 */

import { useEffect, useState } from "react";
import { api, ErroApi, type PreviaExclusaoTransferencia } from "../api.js";
import { Acoes, Erro, Folha } from "../componentes/Folha.js";
import { Carregando } from "../componentes/basicos.js";
import { brl, dataBr } from "../formato.js";

export function ConfirmarExclusaoTransferencia(
  { transferenciaId, aoFechar, aoExcluir }:
  { transferenciaId: string; aoFechar: () => void; aoExcluir: () => void },
) {
  const [previa, setPrevia] = useState<PreviaExclusaoTransferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.previaExclusaoTransferencia(transferenciaId)
      .then((p) => { if (vivo) setPrevia(p); })
      .catch((e) => {
        if (vivo) setErro(e instanceof ErroApi ? e.message : "Não foi possível ler a transferência.");
      });
    return () => { vivo = false; };
  }, [transferenciaId]);

  async function excluir() {
    setErro(null);
    setExcluindo(true);
    try {
      await api.excluirTransferencia(transferenciaId);
      aoExcluir();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível apagar a transferência.");
      setExcluindo(false);
    }
  }

  return (
    <Folha
      titulo="Apagar esta transferência?"
      dica="As duas linhas do extrato somem juntas."
      aoFechar={aoFechar}
    >
      {!previa && !erro && <Carregando />}

      {previa && (
        <div className="perigo">
          <b>{brl(previa.valor)} de {previa.origem.nome} para {previa.destino.nome}</b>
          <div style={{ marginTop: 6 }}>Em {dataBr(previa.data)}.</div>
          {/* Com impedimento, a projeção não sai: mostrar "fica com −6.825,24"
              logo acima de "isto não pode acontecer" se contradiz. O motivo,
              logo abaixo, já traz os dois números que explicam a recusa. */}
          {!previa.impedimento && (
            <ul>
              <li>
                {previa.origem.nome} volta a ter {brl(previa.origem.fica)}
                {" "}(hoje {brl(previa.origem.saldoAtual)})
              </li>
              <li>
                {previa.destino.nome} volta a ter {brl(previa.destino.fica)}
                {" "}(hoje {brl(previa.destino.saldoAtual)})
              </li>
              <li>O caixa total não muda — o dinheiro só volta de onde saiu</li>
            </ul>
          )}
        </div>
      )}

      {previa?.impedimento && (
        <p className="hint" style={{ marginTop: 12 }}>{previa.impedimento}</p>
      )}

      <Erro mensagem={erro} />

      <Acoes>
        {previa && !previa.impedimento && (
          <button className="btn perigo" disabled={excluindo} onClick={() => void excluir()}>
            {excluindo ? "Apagando…" : "Sim, apagar"}
          </button>
        )}
        <button className="btn-sec" onClick={aoFechar}>
          {previa?.impedimento ? "Entendi" : "Cancelar"}
        </button>
      </Acoes>
    </Folha>
  );
}
