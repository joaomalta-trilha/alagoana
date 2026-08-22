/**
 * Barra superior e barra de filtros do desktop — §6.1.
 *
 * "Barra superior azul com o logo à esquerda, abas ao centro-direita e botão
 * 'Lançar custo' à direita. Abaixo, barra branca de filtros: Período, Marca,
 * Faixa de preço, e 'Limpar filtros'."
 */

import { ABAS, type Aba } from "./Navegacao.js";

export interface Filtros {
  periodo: string;   // "" = tudo
  marca: string;     // "" = todas
  faixa: string;     // "" = todas
}

export const SEM_FILTRO: Filtros = { periodo: "", marca: "", faixa: "" };

export function algumFiltroAtivo(f: Filtros): boolean {
  return Boolean(f.periodo || f.marca || f.faixa);
}

/** Vira query string para a API; vazio quando não há recorte. */
export function comoConsulta(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.periodo) p.set("periodo", f.periodo);
  if (f.marca) p.set("marca", f.marca);
  if (f.faixa) p.set("faixa", f.faixa);
  const texto = p.toString();
  return texto ? `&${texto}` : "";
}

export function TopoDesktop(
  { aba, aoTrocar, aoLancarCusto, aoSair }:
  { aba: Aba; aoTrocar: (a: Aba) => void; aoLancarCusto: () => void; aoSair: () => void },
) {
  return (
    <div className="topbar">
      <div className="marca">
        <span className="logo" role="img" aria-label="Alagoana Veículos" />
      </div>
      <span className="lema">gestão de seminovos</span>

      <nav className="abas">
        {ABAS.map(([id, rotulo]) => (
          <button
            key={id} className={id === aba ? "on" : ""}
            onClick={() => aoTrocar(id)}
            aria-current={id === aba ? "page" : undefined}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      <button className="btn-topo" onClick={aoLancarCusto}>Lançar custo</button>
      <button className="sair" onClick={aoSair}>Sair</button>
    </div>
  );
}

export function BarraFiltros(
  { filtros, marcas, aoMudar }:
  { filtros: Filtros; marcas: string[]; aoMudar: (f: Filtros) => void },
) {
  const trocar = (campo: keyof Filtros) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    aoMudar({ ...filtros, [campo]: e.target.value });

  return (
    <div className="filtros">
      <div className="fgrupo">
        <label htmlFor="f-periodo">Período</label>
        <select id="f-periodo" value={filtros.periodo} onChange={trocar("periodo")}>
          <option value="">Tudo</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="180">Últimos 6 meses</option>
        </select>
      </div>

      <div className="fgrupo">
        <label htmlFor="f-marca">Marca</label>
        <select id="f-marca" value={filtros.marca} onChange={trocar("marca")}>
          <option value="">Todas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="fgrupo">
        <label htmlFor="f-faixa">Faixa de preço</label>
        <select id="f-faixa" value={filtros.faixa} onChange={trocar("faixa")}>
          <option value="">Todas</option>
          <option value="a">Até R$ 60 mil</option>
          <option value="b">R$ 60–100 mil</option>
          <option value="c">Acima de R$ 100 mil</option>
        </select>
      </div>

      <button className="flimpar" onClick={() => aoMudar(SEM_FILTRO)}>Limpar filtros</button>
    </div>
  );
}
