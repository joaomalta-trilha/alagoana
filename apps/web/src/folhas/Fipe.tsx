/**
 * Referência Fipe — §4.2.
 *
 * Era preenchida à mão nos dois campos. Desde 21/08/2026 a versão da Fipe é
 * escolhida uma vez e o valor passa a vir da tabela: a Fipe na compra fica
 * fixa e a de hoje se atualiza sozinha quando a tabela vira o mês.
 *
 * Os campos manuais continuam, embaixo, para dois casos reais: a Fipe fora do
 * ar na hora, e o veículo que não tem tabela (`outro`). Tirar a mão de tudo
 * deixaria a loja sem saída num dia ruim de rede.
 *
 * Depreciação é movimento de mercado e **não entra no lucro**: serve para
 * avaliar a decisão de compra e a urgência de girar.
 */

import { useState } from "react";
import { api, ErroApi, type EscolhaFipe, type Ficha } from "../api.js";
import { Acoes, CampoValor, Erro, Folha } from "../componentes/Folha.js";
import { SeletorFipe } from "../componentes/SeletorFipe.js";
import { brl, paraCampo, paraCentavos } from "../formato.js";

export function AtualizarFipe(
  { veiculo, aoFechar, aoGravar }: { veiculo: Ficha; aoFechar: () => void; aoGravar: () => void },
) {
  const [escolha, setEscolha] = useState<EscolhaFipe | null>(null);
  const [compra, setCompra] = useState(paraCampo(veiculo.fipeCompra));
  const [hoje, setHoje] = useState(paraCampo(veiculo.fipeHoje));
  const [anuncio, setAnuncio] = useState(paraCampo(veiculo.valorAnuncio));
  const [manual, setManual] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      // O anúncio é nosso, não da Fipe: vai junto de qualquer jeito.
      await api.editarVeiculo(veiculo.id, {
        valorAnuncio: anuncio.trim() ? paraCentavos(anuncio) : null,
        ...(manual ? {
          fipeCompra: compra.trim() ? paraCentavos(compra) : null,
          fipeHoje: hoje.trim() ? paraCentavos(hoje) : null,
        } : {}),
      });
      if (escolha) await api.definirFipe(veiculo.id, escolha);
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
      dica={`${veiculo.marca} ${veiculo.modelo}${veiculo.ano ? ` ${veiculo.ano}` : ""}`}
      aoFechar={aoFechar}
    >
      {veiculo.fipeVersao && (
        <div className="fipe-atual">
          <b>{veiculo.fipeVersao}</b>
          <div className="cm">
            {veiculo.fipeReferencia
              ? `Tabela de ${veiculo.fipeReferencia}`
              : "Ainda não consultada"}
            {veiculo.fipeHoje !== null && ` · ${brl(veiculo.fipeHoje)}`}
          </div>
        </div>
      )}

      <SeletorFipe
        tipo={veiculo.tipo} marca={veiculo.marca} modelo={veiculo.modelo} ano={veiculo.ano}
        aoEscolher={(e) => setEscolha(e)}
      />

      <CampoValor rotulo="Valor de anúncio" valor={anuncio} aoMudar={setAnuncio} />

      <p className="hint" style={{ marginTop: 10 }}>
        {veiculo.fipeCompra === null
          ? "Ao escolher a versão, a Fipe de hoje entra e a Fipe na compra fica gravada."
          : "A Fipe na compra não muda mais — ela é o retrato do dia da entrada."}
        {" "}A depreciação não entra no lucro.
      </p>

      <button className="acao-linha" onClick={() => setManual((m) => !m)}>
        {manual ? "Esconder os campos manuais" : "Preencher à mão"}
      </button>

      {manual && (
        <div className="dupla" style={{ marginTop: 8 }}>
          <CampoValor rotulo="Fipe na compra" valor={compra} aoMudar={setCompra} />
          <CampoValor rotulo="Fipe hoje" valor={hoje} aoMudar={setHoje} />
        </div>
      )}

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
