/**
 * Confirmação antes de excluir um lançamento de custo.
 *
 * A §4.8 exige que excluir veículo mostre, com números reais, o que será
 * apagado. Excluir custo não tinha nem um "tem certeza": um toque no `×`
 * apagava a linha e devolvia o dinheiro ao saldo na hora. Numa lista de trinta
 * lançamentos, num celular, isso ia acontecer — e o custo do engano é um
 * número errado no lucro de um carro.
 *
 * Os dados já vieram na ficha, então a pergunta aparece na hora, sem espera.
 */

import { useState } from "react";
import { api, ErroApi, type Custo } from "../api.js";
import { Acoes, Erro, Folha } from "../componentes/Folha.js";
import { brl, dataBr } from "../formato.js";

export function ConfirmarExclusaoCusto(
  { custo, aoFechar, aoExcluir }:
  { custo: Custo; aoFechar: () => void; aoExcluir: () => void },
) {
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setErro(null);
    setExcluindo(true);
    try {
      await api.excluirCusto(custo.id);
      aoExcluir();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível remover o custo.");
      setExcluindo(false);
    }
  }

  return (
    <Folha
      titulo="Remover este lançamento?"
      dica="Esta ação não pode ser desfeita."
      aoFechar={aoFechar}
    >
      <div className="perigo">
        <b>{custo.descricao}</b>
        <div style={{ marginTop: 6 }}>
          {custo.categoria} · {custo.prevista ? "prevista" : dataBr(custo.data)} · {brl(custo.valor)}
        </div>
        <ul>
          <li>O custo total do veículo cai {brl(custo.valor)}</li>
          {custo.devolveAoCaixa > 0
            ? <li>{brl(custo.devolveAoCaixa)} voltam para o caixa</li>
            : <li>O caixa não muda — este custo não saiu de nenhuma conta</li>}
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
