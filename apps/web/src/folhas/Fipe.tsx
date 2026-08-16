/**
 * Referência Fipe — §4.2.
 *
 * Preenchida à mão e atualizada mensalmente. Depreciação é movimento de
 * mercado e **não entra no lucro**: serve para avaliar a decisão de compra e a
 * urgência de girar.
 */

import { useState } from "react";
import { api, ErroApi, type Ficha } from "../api.js";
import { Acoes, CampoValor, Erro, Folha } from "../componentes/Folha.js";
import { paraCampo, paraCentavos } from "../formato.js";

export function AtualizarFipe(
  { veiculo, aoFechar, aoGravar }: { veiculo: Ficha; aoFechar: () => void; aoGravar: () => void },
) {
  const [compra, setCompra] = useState(paraCampo(veiculo.fipeCompra));
  const [hoje, setHoje] = useState(paraCampo(veiculo.fipeHoje));
  const [anuncio, setAnuncio] = useState(paraCampo(veiculo.valorAnuncio));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await api.editarVeiculo(veiculo.id, {
        fipeCompra: compra.trim() ? paraCentavos(compra) : null,
        fipeHoje: hoje.trim() ? paraCentavos(hoje) : null,
        valorAnuncio: anuncio.trim() ? paraCentavos(anuncio) : null,
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
      titulo="Referência Fipe"
      dica={`${veiculo.marca} ${veiculo.modelo} · preenchida à mão.`}
      aoFechar={aoFechar}
    >
      <div className="dupla">
        <CampoValor rotulo="Fipe na compra" valor={compra} aoMudar={setCompra} />
        <CampoValor rotulo="Fipe hoje" valor={hoje} aoMudar={setHoje} />
      </div>
      <CampoValor rotulo="Valor de anúncio" valor={anuncio} aoMudar={setAnuncio} />

      <p className="hint" style={{ marginTop: 10 }}>
        A depreciação não entra no lucro. Serve para avaliar a compra e a urgência de girar.
      </p>

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar()}>Salvar</button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
