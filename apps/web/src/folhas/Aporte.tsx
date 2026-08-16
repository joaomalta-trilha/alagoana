/**
 * Aporte ou retirada de sócio — §3.6.
 *
 * "Entrada e saída de capital dos sócios." Grava duas linhas: a movimentação
 * de caixa e a participação. Não confunda com saldo: o sócio pode ter pouco em
 * mãos e muito aportado ao longo do tempo.
 */

import { useState } from "react";
import { api, ErroApi, type Catalogos } from "../api.js";
import {
  Acoes, CampoData, CampoSelecao, CampoTexto, CampoValor, Erro, Folha,
} from "../componentes/Folha.js";
import { hojeISO, paraCentavos } from "../formato.js";

export function Aporte(
  { catalogos, aoFechar, aoGravar }:
  { catalogos: Catalogos; aoFechar: () => void; aoGravar: () => void },
) {
  const contasDeSocio = catalogos.contas.filter((c) => c.tipo === "socio");
  const [tipo, setTipo] = useState<"aporte" | "retirada">("aporte");
  const [socioId, setSocioId] = useState(catalogos.socios[0]?.id ?? "");
  const [contaId, setContaId] = useState(contasDeSocio[0]?.id ?? catalogos.contas[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    const centavos = paraCentavos(valor);
    if (!data || centavos === null || centavos <= 0) {
      setErro("Informe a data e um valor maior que zero.");
      return;
    }
    if (!socioId) {
      setErro("Escolha o sócio.");
      return;
    }

    setSalvando(true);
    try {
      await api.aporte({
        socioId, contaId, data, tipo, valor: centavos,
        observacao: observacao.trim() || null,
      });
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha
      titulo="Aporte ou retirada"
      dica="Entrada e saída de capital dos sócios."
      aoFechar={aoFechar}
    >
      <div className="dupla">
        <CampoSelecao
          rotulo="Operação" valor={tipo}
          aoMudar={(t) => setTipo(t as "aporte" | "retirada")}
        >
          <option value="aporte">Aporte</option>
          <option value="retirada">Retirada</option>
        </CampoSelecao>
        <CampoValor rotulo="Valor" valor={valor} aoMudar={setValor} />
      </div>

      <CampoSelecao rotulo="Sócio" valor={socioId} aoMudar={setSocioId}>
        {catalogos.socios.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </CampoSelecao>

      <CampoSelecao rotulo="Conta" valor={contaId} aoMudar={setContaId}>
        {catalogos.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </CampoSelecao>

      <CampoData rotulo="Data" valor={data} aoMudar={setData} />
      <CampoTexto rotulo="Observação" valor={observacao} aoMudar={setObservacao} dica="opcional" />

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar()}>Salvar</button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
