/**
 * Transferência entre contas do caixa.
 *
 * Remanejamento, não aporte: o dinheiro não entrou nem saiu da empresa, só
 * mudou de bolso. Por isso esta folha não pergunta o sócio — quem transfere
 * escolhe duas contas, e o capital de ninguém se mexe.
 *
 * O saldo aparece ao lado de cada conta no seletor porque a pergunta que vem
 * junto com "transferir" é sempre "quanto tem lá".
 */

import { useState } from "react";
import { api, ErroApi, type Catalogos } from "../api.js";
import {
  Acoes, CampoData, CampoSelecao, CampoTexto, CampoValor, Erro, Folha,
} from "../componentes/Folha.js";
import { brl, hojeISO, paraCentavos } from "../formato.js";

export function Transferencia(
  { catalogos, saldos, aoFechar, aoGravar }: {
    catalogos: Catalogos;
    saldos: { id: string; nome: string; saldo: number }[];
    aoFechar: () => void;
    aoGravar: () => void;
  },
) {
  const contas = catalogos.contas;
  const [origemId, setOrigemId] = useState(contas[0]?.id ?? "");
  const [destinoId, setDestinoId] = useState(contas[1]?.id ?? "");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const saldoDe = (id: string) => saldos.find((s) => s.id === id)?.saldo ?? null;
  const centavos = paraCentavos(valor);
  const saldoOrigem = saldoDe(origemId);

  // O aviso aparece enquanto se digita, antes de tentar salvar — a mensagem do
  // servidor é a mesma, mas chegar antes evita a viagem.
  const naoCabe = saldoOrigem !== null && centavos !== null && centavos > saldoOrigem;

  async function salvar() {
    setErro(null);
    if (centavos === null || centavos <= 0) {
      setErro("Informe um valor de transferência maior que zero.");
      return;
    }
    if (origemId === destinoId) {
      setErro("A conta de origem e a de destino precisam ser diferentes.");
      return;
    }

    setSalvando(true);
    try {
      await api.transferir({
        origemId, destinoId, data, valor: centavos,
        observacao: observacao.trim() || null,
      });
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível transferir.");
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = contas.map((c) => {
    const s = saldoDe(c.id);
    return (
      <option key={c.id} value={c.id}>
        {c.nome}{s === null ? "" : ` · ${brl(s)}`}
      </option>
    );
  });

  return (
    <Folha
      titulo="Transferir entre contas"
      dica="Remaneja dinheiro entre os caixas. Não é aporte: o capital dos sócios não muda."
      aoFechar={aoFechar}
    >
      <CampoSelecao rotulo="De" valor={origemId} aoMudar={setOrigemId}>{opcoes}</CampoSelecao>
      <CampoSelecao rotulo="Para" valor={destinoId} aoMudar={setDestinoId}>{opcoes}</CampoSelecao>

      <div className="dupla">
        <CampoValor rotulo="Valor" valor={valor} aoMudar={setValor} />
        <CampoData rotulo="Data" valor={data} aoMudar={setData} />
      </div>

      {naoCabe && saldoOrigem !== null && (
        <p className="hint" style={{ color: "var(--vermelho)" }}>
          A conta de origem tem {brl(saldoOrigem)}.
        </p>
      )}

      <CampoTexto rotulo="Observação" valor={observacao} aoMudar={setObservacao} dica="opcional" />

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Transferindo…" : "Transferir"}
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
