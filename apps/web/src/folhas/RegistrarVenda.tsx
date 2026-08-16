/**
 * Registrar venda — §4.5 e §4.6.
 *
 * Quando entra um carro na troca, a interface precisa explicar por que o modo
 * "pelo mercado" é o recomendado: supervalorizar a troca é desconto disfarçado,
 * e sem esse lançamento o desconto some do histórico. É o texto que a §8 manda
 * preservar.
 */

import { useState } from "react";
import { api, ErroApi, type Catalogos, type Ficha } from "../api.js";
import {
  Acoes, CampoData, CampoMarcavel, CampoNumero, CampoSelecao, CampoTexto, CampoValor, Erro, Folha,
} from "../componentes/Folha.js";
import { brl, hojeISO, paraCampo, paraCentavos } from "../formato.js";
import { sessao } from "../preferencias.js";

interface Props {
  veiculo: Ficha;
  catalogos: Catalogos;
  aoFechar: () => void;
  aoGravar: () => void;
}

export function RegistrarVenda({ veiculo, catalogos, aoFechar, aoGravar }: Props) {
  const jaTemComissao = veiculo.custos.some((c) => c.categoria === "Comissão");

  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState(paraCampo(veiculo.valorAnuncio));
  const [contaId, setContaId] = useState(sessao.ultimaConta);
  // §4.6: vem marcado, exceto quando o veículo já tem comissão provisionada.
  const [comissoes, setComissoes] = useState(!jaTemComissao);

  const [temTroca, setTemTroca] = useState(false);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [cor, setCor] = useState(catalogos.cores[0] ?? "");
  const [placa, setPlaca] = useState("");
  const [ano, setAno] = useState("");
  const [avaliacao, setAvaliacao] = useState("");
  const [mercado, setMercado] = useState("");
  const [modo, setModo] = useState<"mercado" | "avaliacao">("mercado");

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const avaliacaoC = paraCentavos(avaliacao);
  const mercadoC = paraCentavos(mercado);
  const agio = avaliacaoC !== null && mercadoC !== null ? Math.max(0, avaliacaoC - mercadoC) : 0;

  async function salvar() {
    setErro(null);
    const valorC = paraCentavos(valor);
    if (!data || valorC === null || valorC <= 0) {
      setErro("Informe a data e um valor de venda maior que zero.");
      return;
    }
    if (data < veiculo.dataCompra) {
      setErro("A data da venda não pode ser anterior à da compra.");
      return;
    }
    if (temTroca && (!marca.trim() || !modelo.trim() || !placa.trim() || !avaliacaoC)) {
      setErro("Preencha marca, modelo, placa e a avaliação do carro recebido.");
      return;
    }

    setSalvando(true);
    try {
      await api.vender(veiculo.id, {
        dataVenda: data,
        valorVenda: valorC,
        contaId: contaId || null,
        lancarComissoes: comissoes,
        troca: temTroca ? {
          marca, modelo, cor, placa,
          ano: ano ? Number(ano.replace(/\D/g, "")) : null,
          avaliacao: avaliacaoC, mercado: mercadoC, modo,
        } : null,
      });
      sessao.ultimaConta = contaId;
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível registrar a venda.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha
      titulo="Registrar venda"
      dica={`${veiculo.marca} ${veiculo.modelo} · ${veiculo.placa}`}
      aoFechar={aoFechar}
    >
      <div className="dupla">
        <CampoData rotulo="Data" valor={data} aoMudar={setData} />
        <CampoValor rotulo="Valor" valor={valor} aoMudar={setValor} />
      </div>

      <CampoSelecao rotulo="Receber em" valor={contaId} aoMudar={setContaId}>
        <option value="">Não descontar do caixa</option>
        {catalogos.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </CampoSelecao>

      <CampoMarcavel
        rotulo="Lançar comissões padrão (R$ 1.500)"
        marcado={comissoes} aoMudar={setComissoes}
      />
      {jaTemComissao && (
        <p className="hint">
          Este carro já tem comissão lançada, provavelmente provisionada na entrada.
        </p>
      )}

      <CampoMarcavel
        rotulo="Entrou um carro na troca" marcado={temTroca} aoMudar={setTemTroca}
      />

      {temTroca && (
        <>
          <div className="dupla">
            <CampoTexto rotulo="Marca" valor={marca} aoMudar={setMarca} />
            <CampoTexto rotulo="Modelo" valor={modelo} aoMudar={setModelo} />
          </div>
          <div className="dupla">
            <CampoTexto rotulo="Placa" valor={placa} aoMudar={setPlaca} />
            <CampoNumero rotulo="Ano" valor={ano} aoMudar={setAno} />
          </div>
          <CampoSelecao rotulo="Cor" valor={cor} aoMudar={setCor}>
            {catalogos.cores.map((c) => <option key={c} value={c}>{c}</option>)}
          </CampoSelecao>

          <div className="dupla">
            <CampoValor rotulo="Avaliação dada" valor={avaliacao} aoMudar={setAvaliacao} />
            <CampoValor rotulo="Vale de verdade" valor={mercado} aoMudar={setMercado} />
          </div>

          <CampoSelecao
            rotulo="Entra por" valor={modo}
            aoMudar={(m) => setModo(m as "mercado" | "avaliacao")}
          >
            <option value="mercado">Pelo mercado (recomendado)</option>
            <option value="avaliacao">Pela avaliação</option>
          </CampoSelecao>

          {agio > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              Ágio de <b>{brl(agio)}</b> na troca. Você avaliou o carro acima do que ele vale —
              na prática, um desconto embutido nesta venda.{" "}
              {modo === "mercado"
                ? "Pelo mercado, esse desconto vira um custo desta venda e fica no histórico."
                : "Pela avaliação, o ágio fica embutido no carro que entra e some do histórico desta venda."}
            </p>
          )}
        </>
      )}

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Gravando…" : "Confirmar venda"}
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
