/**
 * Lançamento rápido de custo — §6.7.
 *
 * "A tela mais usada do sistema. Acessível de qualquer lugar." A ordem dos
 * blocos é a da especificação: atalhos, veículo, rateio, descrição/categoria/
 * data/valor, pagar com, e os dois botões de salvar.
 *
 * "Salvar e lançar outro" mantém a folha aberta, preserva veículo e data e
 * limpa descrição e valor — porque quem lança cinco notas do mesmo dia não
 * quer reescolher o carro cinco vezes.
 */

import { useEffect, useState } from "react";
import { api, ErroApi, type Atalho, type Catalogos, type Veiculo } from "../api.js";
import {
  Acoes, CampoData, CampoSelecao, CampoTexto, CampoValor, Erro, Folha,
} from "../componentes/Folha.js";
import { brl, paraCentavos } from "../formato.js";
import { sessao } from "../preferencias.js";
import { useDesktop } from "../tela.js";

interface Props {
  catalogos: Catalogos;
  veiculos: Veiculo[];
  veiculoInicial?: string;
  aoFechar: () => void;
  aoGravar: () => void;
}

export function LancarCusto({ catalogos, veiculos, veiculoInicial, aoFechar, aoGravar }: Props) {
  const desktop = useDesktop();
  const emPatio = veiculos.filter((v) => !v.vendido);
  const vendidos = veiculos.filter((v) => v.vendido);

  const [veiculoId, setVeiculoId] = useState(veiculoInicial ?? emPatio[0]?.id ?? veiculos[0]?.id ?? "");
  const [varios, setVarios] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [modoRateio, setModoRateio] = useState<"mesmo" | "dividir">("dividir");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState(catalogos.categorias[0]?.nome ?? "");
  const [data, setData] = useState(sessao.ultimaData);
  const [valor, setValor] = useState("");
  const [contaId, setContaId] = useState(sessao.ultimaConta);
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { api.atalhos().then(setAtalhos).catch(() => setAtalhos([])); }, []);

  // §6.7, desktop: "Esc fecha e Enter salva e continua." O Esc mora na Folha,
  // que é de todas; o Enter é só desta tela, porque só ela tem "e continua".
  useEffect(() => {
    if (!desktop) return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      // Enter dentro de select ou botão já significa outra coisa.
      if (e.key !== "Enter" || alvo?.tagName === "SELECT" || alvo?.tagName === "BUTTON") return;
      e.preventDefault();
      void salvar(true);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  // A categoria `Retorno` só existe para carro vendido (§4.4). Some da lista
  // enquanto o alvo estiver no pátio, em vez de deixar escolher e recusar
  // depois.
  const alvos = varios ? selecionados : veiculoId ? [veiculoId] : [];
  const todosVendidos = alvos.length > 0 && alvos.every(
    (id) => veiculos.find((v) => v.id === id)?.vendido);
  const categorias = catalogos.categorias.filter((c) => !c.exigeVendido || todosVendidos);

  useEffect(() => {
    if (!categorias.some((c) => c.nome === categoria)) {
      setCategoria(categorias[0]?.nome ?? "");
    }
  }, [categorias, categoria]);

  function usarAtalho(a: Atalho) {
    setDescricao(a.descricao);
    if (categorias.some((c) => c.nome === a.categoria)) setCategoria(a.categoria);
    setValor((a.valor / 100).toFixed(2).replace(".", ","));
  }

  async function salvar(continuar: boolean) {
    setErro(null);
    const centavos = paraCentavos(valor);

    if (varios && selecionados.length === 0) {
      setErro("Selecione pelo menos um carro para o rateio.");
      return;
    }
    if (!descricao.trim() || !data || centavos === null || centavos <= 0) {
      setErro("Preencha descrição, data e um valor maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      await api.lancarCusto({
        veiculoIds: alvos,
        descricao, categoria, data, valor: centavos,
        modoRateio: varios ? modoRateio : "mesmo",
        contaId: contaId || null,
      });
      sessao.ultimaData = data;
      sessao.ultimaConta = contaId;
      aoGravar();
      if (continuar) {
        setDescricao("");
        setValor("");
      } else {
        aoFechar();
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const nome = (v: Veiculo) => `${v.marca} ${v.modelo} · ${v.placa}`;

  return (
    <Folha titulo="Lançar custo" dica="Toque num atalho ou preencha abaixo." aoFechar={aoFechar}>
      {atalhos.length > 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          {atalhos.map((a) => (
            <button key={`${a.descricao}|${a.categoria}`} className="chip" onClick={() => usarAtalho(a)}>
              {a.descricao} · <b>{brl(a.valor)}</b>
            </button>
          ))}
        </div>
      )}

      {!varios && (
        <CampoSelecao rotulo="Veículo" valor={veiculoId} aoMudar={setVeiculoId}>
          <optgroup label="Em pátio">
            {emPatio.map((v) => <option key={v.id} value={v.id}>{nome(v)}</option>)}
          </optgroup>
          <optgroup label="Vendidos">
            {vendidos.map((v) => <option key={v.id} value={v.id}>{nome(v)}</option>)}
          </optgroup>
        </CampoSelecao>
      )}

      {/* Rateio: o custo de tráfego pago é dividido entre os carros anunciados. */}
      <div className="campo caixa" style={{ marginTop: 14 }}>
        <label>
          <input
            type="checkbox" checked={varios}
            onChange={(e) => {
              setVarios(e.target.checked);
              if (e.target.checked && veiculoId) setSelecionados([veiculoId]);
            }}
          />
          Lançar em vários carros
        </label>
      </div>

      {varios && (
        <>
          <div className="campo">
            <label>Carros</label>
            <div className="multi">
              {veiculos.map((v) => (
                <label key={v.id}>
                  <input
                    type="checkbox"
                    checked={selecionados.includes(v.id)}
                    onChange={(e) => setSelecionados((atual) =>
                      e.target.checked ? [...atual, v.id] : atual.filter((id) => id !== v.id))}
                  />
                  {nome(v)}{v.vendido ? " · vendido" : ""}
                </label>
              ))}
            </div>
          </div>
          <CampoSelecao
            rotulo="Como dividir" valor={modoRateio}
            aoMudar={(m) => setModoRateio(m as "mesmo" | "dividir")}
          >
            <option value="dividir">Dividir o valor entre eles</option>
            <option value="mesmo">Mesmo valor em cada um</option>
          </CampoSelecao>
        </>
      )}

      <CampoTexto rotulo="Descrição" valor={descricao} aoMudar={setDescricao} dica="Pintura, Emílio" />

      <div className="dupla">
        <CampoSelecao rotulo="Categoria" valor={categoria} aoMudar={setCategoria}>
          {categorias.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
        </CampoSelecao>
        <CampoValor rotulo="Valor" valor={valor} aoMudar={setValor} />
      </div>

      <div className="dupla">
        <CampoData rotulo="Data" valor={data} aoMudar={setData} />
        <CampoSelecao rotulo="Pagar com" valor={contaId} aoMudar={setContaId}>
          <option value="">Não descontar do caixa</option>
          {catalogos.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </CampoSelecao>
      </div>

      <Erro mensagem={erro} />

      <Acoes>
        <button className="btn" disabled={salvando} onClick={() => void salvar(false)}>Salvar</button>
        <button className="btn-sec" disabled={salvando} onClick={() => void salvar(true)}>
          Salvar e lançar outro
        </button>
        <button className="btn-sec" onClick={aoFechar}>Cancelar</button>
      </Acoes>
    </Folha>
  );
}
