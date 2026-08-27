/**
 * Confirmação antes de desfazer uma venda.
 *
 * Desfazer não é editar: o carro volta ao pátio, o dinheiro sai da conta e as
 * comissões daquele dia somem. É a mesma exigência da §4.8 para a exclusão —
 * "confirmação que lista, com números reais, o que será apagado" —, e vale
 * aqui pelo mesmo motivo: quem confirma precisa ver a conta, não um "tem
 * certeza?".
 *
 * A prévia vem do servidor porque é ele quem sabe se o dinheiro ainda está na
 * conta. Quando não está, o botão não existe: não adianta oferecer uma ação
 * que vai ser recusada.
 */

import { useEffect, useState } from "react";
import { api, ErroApi, type PreviaDesfazerVenda } from "../api.js";
import { Acoes, Erro, Folha } from "../componentes/Folha.js";
import { Carregando } from "../componentes/basicos.js";
import { brl, dataBr } from "../formato.js";

export function ConfirmarDesfazerVenda(
  { veiculoId, aoFechar, aoDesfazer }:
  { veiculoId: string; aoFechar: () => void; aoDesfazer: () => void },
) {
  const [previa, setPrevia] = useState<PreviaDesfazerVenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.previaDesfazerVenda(veiculoId)
      .then((p) => { if (vivo) setPrevia(p); })
      .catch((e) => {
        if (vivo) setErro(e instanceof ErroApi ? e.message : "Não foi possível ler a venda.");
      });
    return () => { vivo = false; };
  }, [veiculoId]);

  async function desfazer() {
    setErro(null);
    setDesfazendo(true);
    try {
      await api.desfazerVenda(veiculoId);
      aoDesfazer();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível desfazer a venda.");
      setDesfazendo(false);
    }
  }

  return (
    <Folha
      titulo="Desfazer a venda?"
      dica="O carro volta para o estoque."
      aoFechar={aoFechar}
    >
      {!previa && !erro && <Carregando />}

      {previa && (
        <div className="perigo">
          <b>{previa.codigo} · {previa.descricao}</b>
          <div style={{ marginTop: 6 }}>
            Vendido em {dataBr(previa.venda.data)} por {brl(previa.venda.valor)}.
          </div>
          <ul>
            <li>O carro volta ao pátio, e o ciclo volta a correr</li>
            {previa.caixa.length === 0
              ? <li>O caixa não muda — esta venda não entrou em nenhuma conta</li>
              : previa.caixa.map((k) => (
                <li key={k.conta}>
                  Saem {brl(k.valor)} de {k.conta}, que fica com {brl(k.saldoAtual - k.valor)}
                </li>
              ))}
            {previa.comissoes.quantidade > 0 && (
              <li>
                {previa.comissoes.quantidade === 1
                  ? "A comissão volta a ser provisão"
                  : `As ${previa.comissoes.quantidade} comissões voltam a ser provisão`}
                {" "}— {brl(previa.comissoes.soma)} continuam no custo do carro,
                mas voltam para o caixa
              </li>
            )}
            {previa.agioTroca.quantidade > 0 && (
              <li>O ágio da troca, de {brl(previa.agioTroca.soma)}, deixa de ser custo</li>
            )}
            <li>Os custos anteriores à venda ficam — o carro volta preparado</li>
          </ul>
        </div>
      )}

      {previa?.impedimento && (
        <p className="hint" style={{ marginTop: 12 }}>{previa.impedimento}</p>
      )}

      <Erro mensagem={erro} />

      <Acoes>
        {previa && !previa.impedimento && (
          <button className="btn perigo" disabled={desfazendo} onClick={() => void desfazer()}>
            {desfazendo ? "Desfazendo…" : "Sim, desfazer"}
          </button>
        )}
        <button className="btn-sec" onClick={aoFechar}>
          {previa?.impedimento ? "Entendi" : "Cancelar"}
        </button>
      </Acoes>
    </Folha>
  );
}
