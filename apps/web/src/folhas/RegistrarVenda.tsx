/**
 * Registrar venda — §4.5 e §4.6.
 *
 * Quando entra um carro na troca, a interface precisa explicar por que o modo
 * "pelo mercado" é o recomendado: supervalorizar a troca é desconto disfarçado,
 * e sem esse lançamento o desconto some do histórico. É o texto que a §8 manda
 * preservar.
 *
 * Numa venda pode entrar mais de um veículo — dois carros, ou um carro e uma
 * moto. Cada recebido é um bloco próprio, e o rodapé mostra o que sobra em
 * dinheiro depois das avaliações e da comissão, que é a pergunta que a loja
 * faz na hora de fechar.
 */

import { useState } from "react";
import { api, ErroApi, type Catalogos, type EscolhaFipe, type Ficha } from "../api.js";
import {
  Acoes, CampoData, CampoMarcavel, CampoNumero, CampoSelecao, CampoTexto, CampoValor, Erro, Folha,
} from "../componentes/Folha.js";
import {
  CamposDeVeiculo, ESCOLHA_VAZIA, resolver, type EscolhaDeVeiculo,
} from "../componentes/CamposDeVeiculo.js";
import { SeletorFipe } from "../componentes/SeletorFipe.js";
import { brl, hojeISO, paraCampo, paraCentavos } from "../formato.js";
import { sessao } from "../preferencias.js";

/** Comissão padrão da §4.6, só para a conta da tela; quem manda é o servidor. */
const COMISSAO_PADRAO = 150_000;

interface Recebido {
  escolha: EscolhaDeVeiculo;
  cor: string;
  placa: string;
  ano: string;
  avaliacao: string;
  mercado: string;
  modo: "mercado" | "avaliacao";
  /** A versão da Fipe deste recebido, quando escolhida. */
  fipe: EscolhaFipe | null;
}

interface Props {
  veiculo: Ficha;
  catalogos: Catalogos;
  aoFechar: () => void;
  aoGravar: () => void;
}

export function RegistrarVenda({ veiculo, catalogos, aoFechar, aoGravar }: Props) {
  const jaTemComissao = veiculo.custos.some((c) => c.categoria === "Comissão");
  const vazio = (): Recebido => ({
    escolha: ESCOLHA_VAZIA, cor: catalogos.cores[0] ?? "", placa: "",
    ano: "", avaliacao: "", mercado: "", modo: "mercado", fipe: null,
  });

  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState(paraCampo(veiculo.valorAnuncio));
  const [contaId, setContaId] = useState(sessao.ultimaConta);
  // §4.6: vem marcado, exceto quando o veículo já tem comissão provisionada.
  const [comissoes, setComissoes] = useState(!jaTemComissao);
  const [recebidos, setRecebidos] = useState<Recebido[]>([]);

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function mudar(i: number, campo: keyof Recebido, valor: unknown) {
    setRecebidos((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  }

  const valorC = paraCentavos(valor);
  const avaliacaoTotal = recebidos.reduce((a, r) => a + (paraCentavos(r.avaliacao) ?? 0), 0);
  const comissaoNoCaixa = comissoes && contaId ? COMISSAO_PADRAO : 0;
  const cai = valorC === null ? null : valorC - avaliacaoTotal - comissaoNoCaixa;

  async function salvar() {
    setErro(null);
    if (!data || valorC === null || valorC <= 0) {
      setErro("Informe a data e um valor de venda maior que zero.");
      return;
    }
    if (data < veiculo.dataCompra) {
      setErro("A data da venda não pode ser anterior à da compra.");
      return;
    }

    const trocas = recebidos.map((r) => {
      const { marca, modelo } = resolver(r.escolha);
      return {
        tipo: r.escolha.tipo, marca, modelo, cor: r.cor, placa: r.placa,
        ano: r.ano ? Number(r.ano.replace(/\D/g, "")) : null,
        avaliacao: paraCentavos(r.avaliacao), mercado: paraCentavos(r.mercado), modo: r.modo,
        // O carro que entra na troca também é um carro entrando: se a versão
        // foi escolhida, o servidor grava a Fipe na compra dele.
        ...(r.fipe ? { fipe: r.fipe } : {}),
      };
    });
    const incompleto = trocas.findIndex(
      (t) => !t.marca || !t.modelo || !t.placa.trim() || !t.avaliacao);
    if (incompleto >= 0) {
      setErro(trocas.length === 1
        ? "Preencha marca, modelo, placa e a avaliação do carro recebido."
        : `No ${incompleto + 1}º veículo recebido, preencha marca, modelo, placa e a avaliação.`);
      return;
    }

    setSalvando(true);
    try {
      await api.vender(veiculo.id, {
        dataVenda: data,
        valorVenda: valorC,
        contaId: contaId || null,
        lancarComissoes: comissoes,
        trocas,
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
        rotulo="Entrou veículo na troca"
        marcado={recebidos.length > 0}
        aoMudar={(marcado) => setRecebidos(marcado ? [vazio()] : [])}
      />

      {recebidos.map((r, i) => {
        const avaliacaoC = paraCentavos(r.avaliacao);
        const mercadoC = paraCentavos(r.mercado);
        const agio = avaliacaoC !== null && mercadoC !== null
          ? Math.max(0, avaliacaoC - mercadoC) : 0;

        return (
          <div className="recebido" key={i}>
            <div className="entre base">
              <div className="bloco-t" style={{ margin: 0 }}>
                {recebidos.length === 1 ? "Veículo recebido" : `${i + 1}º veículo recebido`}
              </div>
              {recebidos.length > 1 && (
                <button
                  className="acao-linha"
                  onClick={() => setRecebidos((rs) => rs.filter((_, j) => j !== i))}
                >
                  Remover
                </button>
              )}
            </div>

            <CamposDeVeiculo
              catalogos={catalogos} escolha={r.escolha}
              aoMudar={(e) => mudar(i, "escolha", e)}
            />
            <div className="dupla">
              <CampoTexto rotulo="Placa" valor={r.placa} aoMudar={(v) => mudar(i, "placa", v)} />
              <CampoNumero rotulo="Ano" valor={r.ano} aoMudar={(v) => mudar(i, "ano", v)} />
            </div>
            <CampoSelecao rotulo="Cor" valor={r.cor} aoMudar={(v) => mudar(i, "cor", v)}>
              {catalogos.cores.map((c) => <option key={c} value={c}>{c}</option>)}
            </CampoSelecao>

            <div className="dupla">
              <CampoValor
                rotulo="Avaliação dada" valor={r.avaliacao}
                aoMudar={(v) => mudar(i, "avaliacao", v)}
              />
              <CampoValor
                rotulo="Vale de verdade" valor={r.mercado}
                aoMudar={(v) => mudar(i, "mercado", v)}
              />
            </div>

            <CampoSelecao
              rotulo="Entra por" valor={r.modo}
              aoMudar={(m) => mudar(i, "modo", m as "mercado" | "avaliacao")}
            >
              <option value="mercado">Pelo mercado (recomendado)</option>
              <option value="avaliacao">Pela avaliação</option>
            </CampoSelecao>

            {(() => {
              const { marca, modelo } = resolver(r.escolha);
              return marca && modelo ? (
                <SeletorFipe
                  tipo={r.escolha.tipo} marca={marca} modelo={modelo}
                  ano={r.ano ? Number(r.ano.replace(/\D/g, "")) : null}
                  aoEscolher={(e) => mudar(i, "fipe", e)}
                />
              ) : null;
            })()}

            {agio > 0 && (
              <p className="hint" style={{ marginTop: 8 }}>
                Ágio de <b>{brl(agio)}</b> na troca. Você avaliou o carro acima do que ele vale —
                na prática, um desconto embutido nesta venda.{" "}
                {r.modo === "mercado"
                  ? "Pelo mercado, esse desconto vira um custo desta venda e fica no histórico."
                  : "Pela avaliação, o ágio fica embutido no carro que entra e some do histórico desta venda."}
              </p>
            )}
          </div>
        );
      })}

      {recebidos.length > 0 && (
        <button
          className="btn-sec"
          onClick={() => setRecebidos((rs) => [...rs, vazio()])}
        >
          + Adicionar outro veículo
        </button>
      )}

      {/* O que sobra em dinheiro. A conta é simples e a loja faz de cabeça na
          hora de fechar; mostrá-la aqui evita a surpresa no extrato. */}
      {valorC !== null && valorC > 0 && (avaliacaoTotal > 0 || comissaoNoCaixa > 0) && (
        <ul className="rows resumo-venda">
          <li className="fraco">
            <span>Valor da venda</span><b>{brl(valorC)}</b>
          </li>
          {avaliacaoTotal > 0 && (
            <li className="fraco">
              <span>
                {recebidos.length === 1 ? "Avaliação do recebido" : `Avaliações · ${recebidos.length}`}
              </span>
              <b>− {brl(avaliacaoTotal)}</b>
            </li>
          )}
          {comissaoNoCaixa > 0 && (
            <li className="fraco"><span>Comissão</span><b>− {brl(comissaoNoCaixa)}</b></li>
          )}
          <li className="sum">
            <span>{contaId ? "Cai na conta" : "Entra em dinheiro"}</span>
            <b>{brl(cai ?? 0)}</b>
          </li>
        </ul>
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
