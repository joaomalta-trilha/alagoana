/**
 * Nova despesa — pedido pela loja em 16/09/2026.
 *
 * Grupo decide a conta, como marca decide o modelo em `CamposDeVeiculo`: só
 * contas ativas aparecem, e trocar o grupo limpa a conta escolhida, porque
 * uma conta do grupo antigo não faz sentido no novo.
 *
 * Sem campo de status: a data decide (`dominio/despesa.ts`, no backend). Sem
 * campo de recorrência nem diluição — ficam para a rodada 2, e por isso nem
 * aparecem aqui, para não prometer um comportamento que ainda não existe.
 */

import { useState } from "react";
import { api, ErroApi, type Catalogos, type ContaDoPlano } from "../api.js";
import {
  Acoes, CampoData, CampoSelecao, CampoTexto, CampoValor, Erro, Folha,
} from "../componentes/Folha.js";
import { hojeISO, paraCentavos } from "../formato.js";
import { sessao } from "../preferencias.js";

interface Props {
  catalogos: Catalogos;
  plano: ContaDoPlano[];
  aoFechar: () => void;
  aoGravar: () => void;
}

export function NovaDespesa({ catalogos, plano, aoFechar, aoGravar }: Props) {
  const ativas = plano.filter((p) => p.ativa);
  const grupos = [...new Map(ativas.map((p) => [p.grupoCodigo, p.grupoNome]))]
    .sort(([a], [b]) => a - b);

  const [grupo, setGrupo] = useState(grupos[0]?.[0] ?? 0);
  const contasDoGrupo = ativas.filter((p) => p.grupoCodigo === grupo);

  const [planoContaId, setPlanoContaId] = useState(contasDoGrupo[0]?.id ?? "");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(sessao.ultimaData);
  const [contaSaidaId, setContaSaidaId] = useState(sessao.ultimaConta || catalogos.contas[0]?.id || "");

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function mudarGrupo(codigo: string) {
    const g = Number(codigo);
    setGrupo(g);
    setPlanoContaId(ativas.find((p) => p.grupoCodigo === g)?.id ?? "");
  }

  async function salvar() {
    setErro(null);
    const valorC = paraCentavos(valor);
    if (!planoContaId || !descricao.trim() || !data || !contaSaidaId || !valorC || valorC <= 0) {
      setErro("Preencha conta, descrição, data e um valor maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      await api.lancarDespesa({
        planoContaId, descricao: descricao.trim(), valor: valorC, data, contaSaidaId,
      });
      sessao.ultimaData = data;
      sessao.ultimaConta = contaSaidaId;
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível lançar a despesa.");
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Nova despesa" dica="Gastos da empresa — não é custo de veículo." aoFechar={aoFechar}>
      <CampoSelecao rotulo="Grupo" valor={String(grupo)} aoMudar={mudarGrupo}>
        {grupos.map(([codigo, nome]) => (
          <option key={codigo} value={codigo}>{codigo} · {nome}</option>
        ))}
      </CampoSelecao>

      <CampoSelecao rotulo="Conta" valor={planoContaId} aoMudar={setPlanoContaId}>
        {contasDoGrupo.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
      </CampoSelecao>

      <CampoTexto
        rotulo="Descrição" valor={descricao} aoMudar={setDescricao}
        dica="Ex.: Aluguel do pátio — setembro"
      />

      <div className="dupla">
        <CampoValor rotulo="Valor" valor={valor} aoMudar={setValor} />
        <CampoData rotulo="Data do pagamento" valor={data} aoMudar={setData} />
      </div>

      <CampoSelecao rotulo="Saída de" valor={contaSaidaId} aoMudar={setContaSaidaId}>
        {catalogos.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </CampoSelecao>

      {data > hojeISO() && (
        <p className="hint">
          Data futura: entra como previsão, sem sair do caixa ainda. Volte aqui para conferir
          quando pagar.
        </p>
      )}

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Salvar despesa"}
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
