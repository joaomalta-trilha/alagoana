/**
 * Tipo, marca e modelo — o trio que muda junto.
 *
 * O tipo vem **antes** de marca e modelo porque é ele que decide qual catálogo
 * carregar. Trocar o tipo limpa os dois, já que a Honda de carro e a Honda de
 * moto são marcas diferentes e um modelo escolhido no catálogo errado seria
 * lixo silencioso.
 *
 * Em `Outros` — reboque, náutico, implemento — marca e modelo viram texto
 * livre e não alimentam catálogo nenhum. Exceção não merece lista.
 *
 * Vive fora dos formulários porque são três: cadastro, edição e o carro
 * recebido na troca. O da troca é o caso principal — receber moto na troca de
 * um carro é o que acontece toda semana.
 */

import type { Catalogos, TipoVeiculo } from "../api.js";
import { CampoSelecao, CampoTexto } from "./Folha.js";

export const OUTRA = " outra";

export interface EscolhaDeVeiculo {
  tipo: TipoVeiculo;
  marca: string;
  marcaNova: string;
  modelo: string;
  modeloNovo: string;
}

export const ESCOLHA_VAZIA: EscolhaDeVeiculo = {
  tipo: "carro", marca: "", marcaNova: "", modelo: "", modeloNovo: "",
};

/** O que efetivamente vai para a API, depois de resolver os "+ Outra…". */
export function resolver(e: EscolhaDeVeiculo): { marca: string; modelo: string } {
  const semCatalogo = e.tipo === "outro";
  return {
    marca: semCatalogo || e.marca === OUTRA ? e.marcaNova.trim() : e.marca,
    modelo: semCatalogo || e.marca === OUTRA || e.modelo === OUTRA
      ? e.modeloNovo.trim()
      : e.modelo,
  };
}

export function CamposDeVeiculo(
  { catalogos, escolha, aoMudar }:
  { catalogos: Catalogos; escolha: EscolhaDeVeiculo; aoMudar: (e: EscolhaDeVeiculo) => void },
) {
  const semCatalogo = escolha.tipo === "outro";
  const marcas = semCatalogo ? [] : catalogos.marcas[escolha.tipo as "carro" | "moto"] ?? [];
  const modelos = marcas.find((m) => m.nome === escolha.marca)?.modelos ?? [];

  const trocarTipo = (valor: string) =>
    aoMudar({ ...ESCOLHA_VAZIA, tipo: valor as TipoVeiculo });

  return (
    <>
      <CampoSelecao rotulo="Tipo" valor={escolha.tipo} aoMudar={trocarTipo}>
        {catalogos.tipos.map((t) => (
          <option key={t.valor} value={t.valor}>{t.rotulo}</option>
        ))}
      </CampoSelecao>

      {semCatalogo ? (
        <>
          <CampoTexto
            rotulo="Marca" valor={escolha.marcaNova}
            aoMudar={(v) => aoMudar({ ...escolha, marcaNova: v })}
            dica="Randon, Fibrafort…"
          />
          <CampoTexto
            rotulo="Modelo" valor={escolha.modeloNovo}
            aoMudar={(v) => aoMudar({ ...escolha, modeloNovo: v })}
          />
        </>
      ) : (
        <>
          <CampoSelecao
            rotulo="Marca" valor={escolha.marca}
            aoMudar={(v) => aoMudar({ ...escolha, marca: v, modelo: "", modeloNovo: "" })}
          >
            <option value="">Escolha…</option>
            {marcas.map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
            <option value={OUTRA}>+ Outra…</option>
          </CampoSelecao>

          {escolha.marca === OUTRA ? (
            <>
              <CampoTexto
                rotulo="Nome da marca" valor={escolha.marcaNova}
                aoMudar={(v) => aoMudar({ ...escolha, marcaNova: v })}
              />
              <CampoTexto
                rotulo="Modelo" valor={escolha.modeloNovo}
                aoMudar={(v) => aoMudar({ ...escolha, modeloNovo: v })}
              />
            </>
          ) : (
            <>
              <CampoSelecao
                rotulo="Modelo" valor={escolha.modelo}
                aoMudar={(v) => aoMudar({ ...escolha, modelo: v })}
              >
                <option value="">Escolha…</option>
                {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value={OUTRA}>+ Outro…</option>
              </CampoSelecao>
              {escolha.modelo === OUTRA && (
                <CampoTexto
                  rotulo="Nome do modelo" valor={escolha.modeloNovo}
                  aoMudar={(v) => aoMudar({ ...escolha, modeloNovo: v })}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
