/**
 * Catálogos de marca, modelo e cor — §3.7.
 *
 * "Marcas chinesas foram deliberadamente omitidas; a interface permite incluir
 * qualquer uma pelo campo '+ Outra…'." Por isso gravar um veículo com marca
 * nova não é erro: é o caminho previsto. O catálogo serve ao autocomplete, e o
 * veículo guarda o texto, não a chave — renomear uma marca aqui não reescreve
 * o histórico dos carros.
 *
 * Versão não é catálogo. É texto livre, e continua assim.
 */

import type { PoolClient } from "pg";
import { ErroDeValidacao } from "../dominio/mensagens.js";
import { CATEGORIAS_CUSTO } from "../dominio/categorias.js";

const limpar = (texto: string) => texto.trim().replace(/\s+/g, " ");

export async function incluirMarca(c: PoolClient, nome: string): Promise<string> {
  const limpo = limpar(nome);
  if (!limpo) throw new ErroDeValidacao("Informe o nome da marca.");
  const { rows } = await c.query<{ id: string }>(
    `insert into marca (nome) values ($1)
     on conflict (nome) do update set nome = excluded.nome
     returning id`,
    [limpo],
  );
  return rows[0]!.id;
}

export async function incluirModelo(c: PoolClient, marca: string, nome: string): Promise<void> {
  const limpo = limpar(nome);
  if (!limpo) throw new ErroDeValidacao("Informe o nome do modelo.");
  const marcaId = await incluirMarca(c, marca);
  await c.query(
    "insert into modelo (marca_id, nome) values ($1, $2) on conflict (marca_id, nome) do nothing",
    [marcaId, limpo],
  );
}

export async function incluirCor(c: PoolClient, nome: string): Promise<void> {
  const limpo = limpar(nome);
  if (!limpo) throw new ErroDeValidacao("Informe o nome da cor.");
  await c.query("insert into cor (nome) values ($1) on conflict (nome) do nothing", [limpo]);
}

/** Chamado ao gravar um veículo: o que for novo entra no catálogo em silêncio. */
export async function garantirCatalogo(
  c: PoolClient, marca: string, modelo: string, cor: string,
): Promise<void> {
  await incluirModelo(c, marca, modelo);
  await incluirCor(c, cor);
}

export interface Catalogos {
  marcas: { nome: string; modelos: string[] }[];
  cores: string[];
  categorias: { nome: string; exigeVendido: boolean }[];
  contas: { id: string; nome: string; tipo: string }[];
  socios: { id: string; nome: string }[];
}

export async function listarCatalogos(c: PoolClient): Promise<Catalogos> {
  // Em série: um PoolClient atende uma consulta por vez.
  const marcas = await c.query<{ marca: string; modelos: string[] }>(
    `select m.nome as marca, coalesce(array_agg(mo.nome order by mo.nome)
                                      filter (where mo.nome is not null), '{}') as modelos
       from marca m
       left join modelo mo on mo.marca_id = m.id and mo.ativo
      where m.ativa
      group by m.nome
      order by m.nome`);
  const cores = await c.query<{ nome: string }>("select nome from cor where ativa order by nome");
  const contas = await c.query<{ id: string; nome: string; tipo: string }>(
    "select id, nome, tipo from conta where ativa order by tipo desc, nome");
  const socios = await c.query<{ id: string; nome: string }>(
    "select id, nome from usuario where ativo order by nome");

  return {
    marcas: marcas.rows.map((m) => ({ nome: m.marca, modelos: m.modelos })),
    cores: cores.rows.map((r) => r.nome),
    // A lista fechada sai do domínio, não do banco: é ela que manda (§3.7).
    // `Não detalhado` não aparece — existe só para a carga inicial.
    categorias: CATEGORIAS_CUSTO
      .filter((cat) => cat.selecionavel)
      .map((cat) => ({ nome: cat.nome, exigeVendido: cat.exigeVendido })),
    contas: contas.rows,
    socios: socios.rows,
  };
}
