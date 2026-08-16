-- Schema inicial — Alagoana Veículos
--
-- Convenções que valem para o arquivo inteiro:
--   dinheiro          numeric(12,2), nunca ponto flutuante
--   data de negócio   date puro (compra, venda, custo, movimento)
--   carimbo de tempo  timestamptz (criado_em, atualizado_em)
-- Datas de negócio são date porque "03/08" tem de ser 03/08 em qualquer
-- fuso. Só o carimbo de auditoria precisa saber a hora.

create extension if not exists pgcrypto;   -- gen_random_uuid()


-- ============================================================ usuário
create type papel_usuario as enum ('master', 'vendedor');

create table usuario (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null unique,
  senha_hash  text,                                    -- nulo = ainda não definiu
  papel       papel_usuario not null default 'master',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Na v1 todo mundo é master. O enum já tem 'vendedor' para não exigir
-- migração quando a regra da §5 entrar.
comment on column usuario.senha_hash is
  'argon2id. Nulo enquanto o usuário não definiu a senha pelo link de ativação.';


-- ============================================================ conta
create type tipo_conta as enum ('empresa', 'socio');

create table conta (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  tipo           tipo_conta not null,
  socio_id       uuid references usuario(id),
  saldo_inicial  numeric(12,2) not null default 0,
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),

  -- conta de sócio tem dono; conta da empresa não
  constraint conta_socio_coerente check (
    (tipo = 'socio'   and socio_id is not null) or
    (tipo = 'empresa' and socio_id is null)
  )
);

-- Saldo nunca é armazenado: saldo_inicial + soma dos movimentos.
-- Ver a view saldo_conta no fim do arquivo.


-- ============================================================ catálogos
create table marca (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null unique,
  ativa   boolean not null default true
);

create table modelo (
  id        uuid primary key default gen_random_uuid(),
  marca_id  uuid not null references marca(id) on delete cascade,
  nome      text not null,
  ativo     boolean not null default true,
  unique (marca_id, nome)
);

create table cor (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null unique,
  ativa   boolean not null default true
);

-- O catálogo serve ao autocomplete. O veículo guarda o texto, não a FK:
-- renomear uma marca aqui não reescreve o histórico dos carros.


-- ============================================================ veículo
create type origem_veiculo as enum ('compra', 'troca');

create table veiculo (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,               -- V-01, V-02… nunca reusado
  marca            text not null,
  modelo           text not null,
  versao           text,                               -- campo aberto, sem catálogo
  ano              integer,
  cor              text not null,
  placa            text not null,
  km               integer,
  data_compra      date not null,
  valor_compra     numeric(12,2) not null,
  valor_anuncio    numeric(12,2),
  fipe_compra      numeric(12,2),
  fipe_hoje        numeric(12,2),
  data_venda       date,
  valor_venda      numeric(12,2),
  origem           origem_veiculo not null default 'compra',
  troca_de_id      uuid references veiculo(id),        -- preenchido no que ENTRA
  avaliacao_troca  numeric(12,2),
  mercado_troca    numeric(12,2),
  observacao       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  constraint veiculo_compra_positiva check (valor_compra > 0),
  constraint veiculo_venda_positiva  check (valor_venda is null or valor_venda > 0),
  constraint veiculo_venda_completa  check ((data_venda is null) = (valor_venda is null)),
  constraint veiculo_venda_apos_compra check (data_venda is null or data_venda >= data_compra),
  constraint veiculo_placa_maiuscula check (placa = upper(placa)),
  constraint veiculo_nao_troca_de_si check (troca_de_id is null or troca_de_id <> id)
);

create index veiculo_placa_idx      on veiculo (placa);
create index veiculo_em_estoque_idx on veiculo (data_venda) where data_venda is null;
create index veiculo_troca_de_idx   on veiculo (troca_de_id);

-- placa NÃO é única: o mesmo carro pode voltar para a loja numa troca
-- ou ser recomprado. A interface avisa sobre repetição, não bloqueia.

-- agio_troca não existe como coluna: é avaliacao_troca - mercado_troca,
-- calculado quando positivo. Guardar derivado só cria chance de divergir.


-- ============================================================ custo
create table custo (
  id          uuid primary key default gen_random_uuid(),
  veiculo_id  uuid not null references veiculo(id) on delete cascade,
  descricao   text not null,
  categoria   text not null,
  data        date,                                    -- nulo = previsto
  valor       numeric(12,2) not null,
  criado_em   timestamptz not null default now(),

  constraint custo_valor_positivo check (valor > 0),
  constraint custo_categoria_valida check (categoria in (
    'Combustível','Transferência','Consulta','Peças','Pintura','Polimento','Reparo',
    'Manutenção','Revisão','Serviço','Guincho','IPVA','Imposto','Amarelinha','Cautelar',
    'Bateria','Chaveiro','Lâmpada','Patrocinado','Comissão','Retorno','Troca','Não detalhado'
  ))
);

create index custo_veiculo_idx   on custo (veiculo_id);
create index custo_categoria_idx on custo (categoria);
create index custo_data_idx      on custo (data);

comment on column custo.data is
  'Nulo = custo previsto, ainda não realizado. Entra no custo total normalmente.';


-- ============================================================ caixa
create type tipo_movimento as enum ('aporte', 'retirada', 'compra', 'custo', 'venda');

create table movimento_caixa (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references conta(id),
  data        date not null,
  descricao   text not null,
  tipo        tipo_movimento not null,
  valor       numeric(12,2) not null,                  -- COM SINAL: negativo = saída
  veiculo_id  uuid references veiculo(id) on delete cascade,
  custo_id    uuid references custo(id)   on delete cascade,
  criado_em   timestamptz not null default now(),

  constraint movimento_nao_zero check (valor <> 0)
);

create index movimento_conta_idx   on movimento_caixa (conta_id);
create index movimento_data_idx    on movimento_caixa (data);
create index movimento_veiculo_idx on movimento_caixa (veiculo_id);
create index movimento_custo_idx   on movimento_caixa (custo_id);


-- ============================================================ capital dos sócios
create type tipo_aporte as enum ('aporte', 'retirada');

create table aporte_socio (
  id            uuid primary key default gen_random_uuid(),
  socio_id      uuid not null references usuario(id),
  conta_id      uuid references conta(id),
  movimento_id  uuid references movimento_caixa(id) on delete cascade,
  data          date not null,
  tipo          tipo_aporte not null,
  valor         numeric(12,2) not null,                -- sempre positivo
  observacao    text,
  criado_em     timestamptz not null default now(),

  constraint aporte_valor_positivo check (valor > 0)
);

create index aporte_socio_idx on aporte_socio (socio_id);

-- movimento_id é nulo apenas no capital de implantação: a §9 manda o extrato
-- começar vazio, então os aportes iniciais existem sem movimentação de caixa.
-- Todo aporte lançado pelo sistema depois disso tem movimento.


-- ============================================================ auditoria
create table evento (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references usuario(id),
  entidade    text not null,                           -- 'veiculo', 'custo', …
  entidade_id uuid,
  acao        text not null,                           -- 'criou', 'editou', 'excluiu'
  antes       jsonb,
  depois      jsonb,
  criado_em   timestamptz not null default now()
);

create index evento_entidade_idx on evento (entidade, entidade_id);
create index evento_data_idx     on evento (criado_em desc);

-- Append-only. A planilha tinha histórico de versões; sem isto o sistema
-- seria uma regressão para três pessoas editando os mesmos números.


-- ============================================================ configuração
create table config (
  chave  text primary key,
  valor  jsonb not null
);

-- Guarda data_implantacao e as comissões padrão (§4.6), que precisam ser
-- editáveis sem deploy.


-- ============================================================ views
create view saldo_conta as
select c.id      as conta_id,
       c.nome,
       c.tipo,
       c.saldo_inicial + coalesce(sum(m.valor), 0) as saldo
  from conta c
  left join movimento_caixa m on m.conta_id = c.id
 where c.ativa
 group by c.id, c.nome, c.tipo, c.saldo_inicial;

create view custo_veiculo as
select v.id                                       as veiculo_id,
       coalesce(sum(c.valor), 0)                  as custo_preparacao,
       v.valor_compra + coalesce(sum(c.valor), 0) as custo_total,
       count(c.id)                                as lancamentos
  from veiculo v
  left join custo c on c.veiculo_id = v.id
 group by v.id, v.valor_compra;

create view capital_socio as
select u.id   as socio_id,
       u.nome,
       coalesce(sum(case when a.tipo = 'aporte'   then a.valor else 0 end), 0) as aportes,
       coalesce(sum(case when a.tipo = 'retirada' then a.valor else 0 end), 0) as retiradas,
       coalesce(sum(case when a.tipo = 'aporte'   then a.valor else -a.valor end), 0) as capital
  from usuario u
  left join aporte_socio a on a.socio_id = u.id
 group by u.id, u.nome;
