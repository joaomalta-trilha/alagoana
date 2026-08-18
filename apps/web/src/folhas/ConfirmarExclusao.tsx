/**
 * Confirmação de exclusão — §4.8.
 *
 * "Exige confirmação que lista, com números reais, o que será apagado." Não é
 * um "tem certeza?": é a conta do estrago, buscada da API antes de perguntar.
 * E deixa claro o que **não** some — o carro ligado por troca continua no
 * sistema, só perde o vínculo.
 */

import { useEffect, useState } from "react";
import { api, ErroApi, type PreviaExclusao } from "../api.js";
import { Acoes, Erro, Folha } from "../componentes/Folha.js";
import { brl } from "../formato.js";

export function ConfirmarExclusao(
  { veiculoId, aoFechar, aoExcluir }:
  { veiculoId: string; aoFechar: () => void; aoExcluir: () => void },
) {
  const [previa, setPrevia] = useState<PreviaExclusao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    api.previaExclusao(veiculoId)
      .then(setPrevia)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar."));
  }, [veiculoId]);

  async function excluir() {
    setErro(null);
    setExcluindo(true);
    try {
      await api.excluirVeiculo(veiculoId);
      aoExcluir();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir.");
      setExcluindo(false);
    }
  }

  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

  return (
    <Folha titulo="Excluir este veículo?" dica="Esta ação não pode ser desfeita." aoFechar={aoFechar}>
      {previa && (
        <div className="perigo">
          <b>{previa.codigo} · {previa.descricao}</b>
          <div style={{ marginTop: 9 }}>Serão apagados junto:</div>
          <ul>
            <li>
              {plural(previa.custos.quantidade, "lançamento", "lançamentos")} de custo,
              somando {brl(previa.custos.soma)}
            </li>
            <li>
              {plural(previa.movimentos.quantidade, "movimentação", "movimentações")} de caixa
              {previa.movimentos.quantidade > 0 &&
                `, devolvendo ${brl(Math.abs(previa.movimentos.valorDevolvido))} ao saldo`}
            </li>
            {previa.venda && <li>A venda de {brl(previa.venda.valor)}</li>}
            {previa.trocas.length > 0 && (
              <li>
                {previa.trocas.length === 1 ? "O vínculo de troca com o " : "Os vínculos de troca com "}
                <b>{previa.trocas.map((t) => t.codigo).join(", ")}</b>, que{" "}
                <b>{previa.trocas.length === 1 ? "continua" : "continuam"} no sistema</b>
              </li>
            )}
          </ul>
        </div>
      )}

      <Erro mensagem={erro} />

      <Acoes>
        <button
          className="btn perigo" disabled={!previa || excluindo}
          onClick={() => void excluir()}
        >
          {excluindo ? "Excluindo…" : "Sim, excluir"}
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
