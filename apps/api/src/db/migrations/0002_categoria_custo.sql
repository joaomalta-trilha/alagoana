-- Categorias de custo — §3.7
--
-- A especificação chama isto de "lista fechada no código", e ela continua
-- sendo: a fonte de verdade é `src/dominio/categorias.ts`, e `db:conferir`
-- falha se o banco divergir dela. A tabela existe por três motivos que uma
-- constante em TypeScript não resolve:
--
--   1. `ordem` — a §3.7 fixa a ordem de exibição do seletor, e ordem é dado.
--   2. `selecionavel` e `exige_vendido` — as duas regras especiais da §3.7
--      (Não detalhado fora do seletor, Retorno só em carro vendido) viram
--      coluna em vez de `if` espalhado pela interface.
--   3. A chave estrangeira abaixo fecha a lista no banco, não só na API.
--
-- Ela vive na migração, e não em `semear.ts`, porque é estrutura: um banco
-- recém-migrado sem carga inicial precisa das categorias para aceitar o
-- primeiro custo.

create table categoria_custo (
  nome           text primary key,
  ordem          smallint not null unique,
  selecionavel   boolean not null default true,   -- aparece no seletor da interface
  exige_vendido  boolean not null default false   -- só permitida em veículo com data_venda
);

insert into categoria_custo (nome, ordem, selecionavel, exige_vendido) values
  ('Combustível',     1, true,  false),
  ('Transferência',   2, true,  false),
  ('Consulta',        3, true,  false),
  ('Peças',           4, true,  false),
  ('Pintura',         5, true,  false),
  ('Polimento',       6, true,  false),
  ('Reparo',          7, true,  false),
  ('Manutenção',      8, true,  false),
  ('Revisão',         9, true,  false),
  ('Serviço',        10, true,  false),
  ('Guincho',        11, true,  false),
  ('IPVA',           12, true,  false),
  ('Imposto',        13, true,  false),
  ('Amarelinha',     14, true,  false),
  ('Cautelar',       15, true,  false),
  ('Bateria',        16, true,  false),
  ('Chaveiro',       17, true,  false),
  ('Lâmpada',        18, true,  false),
  ('Patrocinado',    19, true,  false),
  ('Comissão',       20, true,  false),
  ('Retorno',        21, true,  true ),   -- §4.4: só em carro já vendido
  ('Troca',          22, true,  false),   -- §4.5: lançada pelo sistema no modo "pelo mercado"
  ('Não detalhado',  23, false, false);   -- §3.7: existe só para a carga inicial

comment on column categoria_custo.exige_vendido is
  'Retorno é custo de garantia (§4.4). A validação vive na API; a coluna diz qual é a regra.';


-- A lista fechada deixa de ser um CHECK repetido no DDL e passa a ser
-- referência. Ganho prático: incluir ou renomear uma categoria vira INSERT ou
-- UPDATE, não ALTER TABLE, e `on update cascade` arrasta os custos junto.
alter table custo drop constraint custo_categoria_valida;

alter table custo
  add constraint custo_categoria_fk
  foreign key (categoria) references categoria_custo (nome)
  on update cascade;
