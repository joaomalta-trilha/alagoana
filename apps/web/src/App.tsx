/**
 * O casco do app mobile — §6.1.
 *
 * Barra superior azul, navegação inferior fixa de quatro ícones, e o botão
 * flutuante "+ Custo" acima dela em todas as telas exceto Caixa. A ficha do
 * veículo não é uma quinta aba: ela abre por cima e volta para a lista de
 * onde veio.
 */

import { useCallback, useEffect, useState } from "react";
import {
  api, type Catalogos, type Custo, type Ficha as DadosFicha, type Usuario, type Veiculo,
} from "./api.js";
import { Navegacao, Topo, type Aba } from "./componentes/Navegacao.js";
import {
  BarraFiltros, TopoDesktop, comoConsulta, SEM_FILTRO, type Filtros,
} from "./componentes/Desktop.js";
import { Carregando } from "./componentes/basicos.js";
import { useDesktop } from "./tela.js";
import { Login } from "./telas/Login.js";
import { Painel } from "./telas/Painel.js";
import { Estoque } from "./telas/Estoque.js";
import { Vendas } from "./telas/Vendas.js";
import { Caixa } from "./telas/Caixa.js";
import { Ficha } from "./telas/Ficha.js";
import { LancarCusto } from "./folhas/LancarCusto.js";
import { RegistrarVenda } from "./folhas/RegistrarVenda.js";
import { FormVeiculo } from "./folhas/FormVeiculo.js";
import { AtualizarFipe } from "./folhas/Fipe.js";
import { Aporte } from "./folhas/Aporte.js";
import { Transferencia } from "./folhas/Transferencia.js";
import { ConfirmarExclusao } from "./folhas/ConfirmarExclusao.js";
import { ConfirmarExclusaoCusto } from "./folhas/ConfirmarExclusaoCusto.js";
import { ConfirmarDesfazerVenda } from "./folhas/ConfirmarDesfazerVenda.js";
import { ConfirmarExclusaoTransferencia } from "./folhas/ConfirmarExclusaoTransferencia.js";

type Folha =
  | { tipo: "custo"; veiculoId?: string }
  | { tipo: "venda"; veiculo: DadosFicha }
  | { tipo: "veiculo"; veiculo?: DadosFicha }
  | { tipo: "fipe"; veiculo: DadosFicha }
  | { tipo: "aporte" }
  | { tipo: "transferencia"; contas: { id: string; nome: string; saldo: number }[] }
  | { tipo: "desfazerVenda"; veiculoId: string }
  | { tipo: "exclusaoTransferencia"; transferenciaId: string }
  | { tipo: "exclusao"; veiculoId: string }
  | { tipo: "exclusaoCusto"; custo: Custo }
  | null;

const NOMES: Record<Aba, string> = {
  painel: "Painel", estoque: "Estoque", vendas: "Vendas", caixa: "Caixa",
};

export function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [conferindo, setConferindo] = useState(true);

  const [aba, setAba] = useState<Aba>("estoque");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [folha, setFolha] = useState<Folha>(null);
  const [versao, setVersao] = useState(0);

  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);

  // Os filtros da §6.1 são de desktop e valem em todas as telas ao mesmo tempo.
  const desktop = useDesktop();
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  const recorte = desktop ? comoConsulta(filtros) : "";

  const atualizar = useCallback(() => setVersao((v) => v + 1), []);

  // O cookie decide se há sessão. Não há token guardado para conferir.
  useEffect(() => {
    api.eu()
      .then(({ usuario: u }) => setUsuario(u))
      .catch(() => setUsuario(null))
      .finally(() => setConferindo(false));
  }, []);

  // O que as folhas precisam saber: catálogos e a frota inteira.
  useEffect(() => {
    if (!usuario) return;
    void api.catalogos().then(setCatalogos).catch(() => setCatalogos(null));
    void api.veiculos("todos").then((r) => setVeiculos(r.veiculos)).catch(() => setVeiculos([]));
  }, [usuario, versao]);

  useEffect(() => {
    document.body.classList.toggle("com-nav", Boolean(usuario));
  }, [usuario]);

  function irPara(nova: Aba) {
    setAba(nova);
    setFichaId(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function abrirFicha(id: string) {
    setFichaId(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function sair() {
    await api.sair().catch(() => undefined);
    setUsuario(null);
    setFichaId(null);
    setFolha(null);
  }

  if (conferindo) return <Carregando />;
  if (!usuario) return <Login aoEntrar={setUsuario} />;

  const tela = fichaId ? "Veículo" : NOMES[aba];

  const marcas = [...new Set(veiculos.map((v) => v.marca))].sort();

  return (
    <>
      {desktop ? (
        <>
          <TopoDesktop
            aba={aba} aoTrocar={irPara}
            aoLancarCusto={() => setFolha({ tipo: "custo" })}
            aoSair={() => void sair()}
          />
          <BarraFiltros filtros={filtros} marcas={marcas} aoMudar={setFiltros} />
        </>
      ) : (
        <Topo tela={tela} aoSair={() => void sair()} />
      )}

      <div className="wrap">
        {fichaId ? (
          <Ficha
            id={fichaId}
            versao={versao}
            aoVoltar={() => setFichaId(null)}
            aoAbrirOutro={abrirFicha}
            aoEditar={(v) => setFolha({ tipo: "veiculo", veiculo: v })}
            aoExcluir={(v) => setFolha({ tipo: "exclusao", veiculoId: v.id })}
            aoVender={(v) => setFolha({ tipo: "venda", veiculo: v })}
            aoLancarCusto={(v) => setFolha({ tipo: "custo", veiculoId: v.id })}
            aoAtualizarFipe={(v) => setFolha({ tipo: "fipe", veiculo: v })}
            aoRemoverCusto={(custo) => setFolha({ tipo: "exclusaoCusto", custo })}
            aoDesfazerVenda={(v) => setFolha({ tipo: "desfazerVenda", veiculoId: v.id })}
          />
        ) : aba === "painel" ? (
          <Painel versao={versao} recorte={recorte} />
        ) : aba === "estoque" ? (
          <Estoque
            versao={versao}
            recorte={recorte}
            aoAbrirFicha={abrirFicha}
            aoLancarCarro={() => setFolha({ tipo: "veiculo" })}
          />
        ) : aba === "vendas" ? (
          <Vendas versao={versao} recorte={recorte} aoAbrirFicha={abrirFicha} />
        ) : (
          <Caixa
            versao={versao}
            aoAportar={() => setFolha({ tipo: "aporte" })}
            aoTransferir={(contas) => setFolha({ tipo: "transferencia", contas })}
            aoApagarTransferencia={(transferenciaId) =>
              setFolha({ tipo: "exclusaoTransferencia", transferenciaId })}
          />
        )}
      </div>

      {/* §6.1: o flutuante existe em todas as telas exceto Caixa. */}
      {aba !== "caixa" && (
        <button className="fab" onClick={() => setFolha({ tipo: "custo" })}>+ Custo</button>
      )}

      <Navegacao aba={aba} aoTrocar={irPara} />

      {catalogos && folha?.tipo === "custo" && (
        <LancarCusto
          catalogos={catalogos}
          veiculos={veiculos}
          {...(folha.veiculoId ? { veiculoInicial: folha.veiculoId } : {})}
          aoFechar={() => setFolha(null)}
          aoGravar={atualizar}
        />
      )}
      {catalogos && folha?.tipo === "venda" && (
        <RegistrarVenda
          veiculo={folha.veiculo} catalogos={catalogos}
          aoFechar={() => setFolha(null)} aoGravar={atualizar}
        />
      )}
      {catalogos && folha?.tipo === "veiculo" && (
        <FormVeiculo
          catalogos={catalogos}
          {...(folha.veiculo ? { veiculo: folha.veiculo } : {})}
          aoFechar={() => setFolha(null)}
          aoGravar={(id) => { atualizar(); if (!folha.veiculo) abrirFicha(id); }}
        />
      )}
      {folha?.tipo === "fipe" && (
        <AtualizarFipe
          veiculo={folha.veiculo} aoFechar={() => setFolha(null)} aoGravar={atualizar}
        />
      )}
      {catalogos && folha?.tipo === "aporte" && (
        <Aporte catalogos={catalogos} aoFechar={() => setFolha(null)} aoGravar={atualizar} />
      )}
      {catalogos && folha?.tipo === "transferencia" && (
        <Transferencia
          catalogos={catalogos} saldos={folha.contas}
          aoFechar={() => setFolha(null)} aoGravar={atualizar}
        />
      )}
      {folha?.tipo === "exclusaoTransferencia" && (
        <ConfirmarExclusaoTransferencia
          transferenciaId={folha.transferenciaId}
          aoFechar={() => setFolha(null)}
          aoExcluir={atualizar}
        />
      )}
      {folha?.tipo === "desfazerVenda" && (
        <ConfirmarDesfazerVenda
          veiculoId={folha.veiculoId}
          aoFechar={() => setFolha(null)}
          aoDesfazer={atualizar}
        />
      )}
      {folha?.tipo === "exclusaoCusto" && (
        <ConfirmarExclusaoCusto
          custo={folha.custo}
          aoFechar={() => setFolha(null)}
          aoExcluir={atualizar}
        />
      )}
      {folha?.tipo === "exclusao" && (
        <ConfirmarExclusao
          veiculoId={folha.veiculoId}
          aoFechar={() => setFolha(null)}
          aoExcluir={() => { setFichaId(null); atualizar(); }}
        />
      )}
    </>
  );
}
