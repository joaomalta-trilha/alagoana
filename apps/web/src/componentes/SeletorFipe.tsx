/**
 * Escolher a versão da Fipe de um veículo.
 *
 * A Fipe tem 116 versões de HB20, e entre as de 2014 a mais barata e a mais
 * cara diferem 31%. Adivinhar a versão pelo nome do modelo escreveria um
 * número que parece Fipe e não é — então ela é escolhida uma vez, aqui.
 *
 * A marca sai sozinha (das 47 do catálogo, 44 casam por caixa e três têm
 * apelido conhecido), e a lista já vem filtrada pelo modelo. O que sobra é
 * uma escolha, com um campo de busca para as listas longas.
 *
 * Nada aqui é obrigatório: a Fipe pode estar fora do ar, e carro entra no
 * pátio de qualquer jeito.
 */

import { useEffect, useState } from "react";
import { api, ErroApi, type EscolhaFipe, type ItemFipe } from "../api.js";
import { Campo } from "./Folha.js";

interface Props {
  tipo: string;
  marca: string;
  modelo: string;
  ano: number | null;
  /** Chamado a cada mudança: escolha completa, ou nulo enquanto falta algo. */
  aoEscolher: (escolha: EscolhaFipe | null, versao: string | null) => void;
}

export function SeletorFipe({ tipo, marca, modelo, ano, aoEscolher }: Props) {
  const [versoes, setVersoes] = useState<ItemFipe[] | null>(null);
  const [marcaCodigo, setMarcaCodigo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [modeloCodigo, setModeloCodigo] = useState("");
  const [anos, setAnos] = useState<ItemFipe[] | null>(null);
  const [anoCodigo, setAnoCodigo] = useState("");
  const [carregandoAnos, setCarregandoAnos] = useState(false);

  // Carrega as versões quando marca e modelo estiverem definidos.
  useEffect(() => {
    if (!marca || !modelo) { setVersoes(null); return; }
    let vivo = true;
    setVersoes(null);
    setAviso(null);
    setModeloCodigo("");
    setAnos(null);

    api.versoesFipe(tipo, marca, modelo)
      .then((r) => {
        if (!vivo) return;
        if (r.semTabela) { setAviso("A Fipe não tem tabela para este tipo."); return; }
        if (r.indisponivel) { setAviso("A Fipe não respondeu agora. Dá para preencher depois, pela ficha."); return; }
        setMarcaCodigo(r.marcaCodigo);
        setVersoes(r.versoes);
        if (r.listaInteira) {
          setAviso(`Não achei "${modelo}" na Fipe desta marca. A lista veio inteira — use a busca.`);
        }
      })
      .catch((e) => {
        if (vivo) setAviso(e instanceof ErroApi ? e.message : "Não foi possível consultar a Fipe.");
      });
    return () => { vivo = false; };
  }, [tipo, marca, modelo]);

  // Escolhida a versão, busca os anos dela e aponta o do veículo.
  useEffect(() => {
    if (!modeloCodigo || !marcaCodigo) return;
    let vivo = true;
    setCarregandoAnos(true);
    setAnos(null);
    setAnoCodigo("");
    aoEscolher(null, null);

    api.anosFipe({ tipo, marca: marcaCodigo, modelo: modeloCodigo, ano: String(ano ?? "") })
      .then((r) => {
        if (!vivo) return;
        setAnos(r.anos);
        if (r.sugerido) {
          setAnoCodigo(r.sugerido);
          aoEscolher({ marcaCodigo, modeloCodigo, anoCodigo: r.sugerido },
                     versoes?.find((v) => v.codigo === modeloCodigo)?.nome ?? null);
        }
      })
      .catch(() => { if (vivo) setAnos([]); })
      .finally(() => { if (vivo) setCarregandoAnos(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeloCodigo, marcaCodigo]);

  function escolherAno(codigo: string) {
    setAnoCodigo(codigo);
    aoEscolher(codigo ? { marcaCodigo, modeloCodigo, anoCodigo: codigo } : null,
               versoes?.find((v) => v.codigo === modeloCodigo)?.nome ?? null);
  }

  if (aviso && !versoes) return <p className="hint">{aviso}</p>;
  if (!versoes) return <p className="hint">Consultando a Fipe…</p>;

  const filtradas = busca.trim()
    ? versoes.filter((v) => v.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : versoes;

  // O ano do veículo não existe nesta versão: é o sinal mais útil de que a
  // versão escolhida não é a certa.
  const anoFora = anos !== null && anos.length > 0 && !anoCodigo && ano !== null;

  return (
    <>
      {aviso && <p className="hint">{aviso}</p>}

      {versoes.length > 12 && (
        <Campo rotulo="Buscar versão">
          {(id) => (
            <input
              id={id} type="text" value={busca} placeholder="ex.: comfort 1.0"
              onChange={(e) => setBusca(e.target.value)}
            />
          )}
        </Campo>
      )}

      <Campo rotulo={`Versão na Fipe · ${filtradas.length} de ${versoes.length}`}>
        {(id) => (
          <select id={id} value={modeloCodigo} onChange={(e) => setModeloCodigo(e.target.value)}>
            <option value="">Escolha a versão…</option>
            {filtradas.map((v) => <option key={v.codigo} value={v.codigo}>{v.nome}</option>)}
          </select>
        )}
      </Campo>

      {carregandoAnos && <p className="hint">Consultando os anos…</p>}

      {anos !== null && anos.length > 0 && (
        <Campo rotulo="Ano na Fipe">
          {(id) => (
            <select id={id} value={anoCodigo} onChange={(e) => escolherAno(e.target.value)}>
              <option value="">Escolha o ano…</option>
              {anos.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
            </select>
          )}
        </Campo>
      )}

      {anoFora && (
        <p className="hint" style={{ color: "var(--vermelho)" }}>
          Esta versão não existe em {ano} na Fipe. Provavelmente é outra versão —
          ou escolha um dos anos acima.
        </p>
      )}
    </>
  );
}
