/**
 * Confirmação antes de excluir uma despesa — mesmo motivo de
 * `ConfirmarExclusaoCusto`: um toque de mais numa lista, no celular, custa um
 * número errado no resultado da empresa.
 */

import { useState } from "react";
import { api, ErroApi, type Despesa } from "../api.js";
import { Acoes, Erro, Folha } from "../componentes/Folha.js";
import { brl, dataBr } from "../formato.js";

export function ConfirmarExclusaoDespesa(
  { despesa, aoFechar, aoExcluir }:
  { despesa: Despesa; aoFechar: () => void; aoExcluir: () => void },
) {
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setErro(null);
    setExcluindo(true);
    try {
      await api.excluirDespesa(despesa.id);
      aoExcluir();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível remover a despesa.");
      setExcluindo(false);
    }
  }

  return (
    <Folha titulo="Remover esta despesa?" dica="Esta ação não pode ser desfeita." aoFechar={aoFechar}>
      <div className="perigo">
        <b>{despesa.descricao}</b>
        <div style={{ marginTop: 6 }}>
          {despesa.planoConta.codigo} {despesa.planoConta.nome} · {dataBr(despesa.dataPagamento)} ·
          {" "}{brl(despesa.valor)}
        </div>
        <ul>
          {despesa.status === "pago"
            ? <li>{brl(despesa.valor)} voltam para {despesa.contaSaida.nome}</li>
            : <li>O caixa não muda — esta despesa ainda não tinha saído de nenhuma conta</li>}
        </ul>
      </div>

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn perigo" disabled={excluindo} onClick={() => void excluir()}>
          {excluindo ? "Removendo…" : "Sim, remover"}
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
