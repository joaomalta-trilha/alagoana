-- Despesas da empresa — pedido pela loja em 16/09/2026.
--
-- Custo de veículo some quando o carro é vendido; despesa da empresa (aluguel,
-- contabilidade, marketing, seguro) existe mesmo com o pátio vazio. As duas
-- coisas não se misturam em relatório nenhum — são naturezas diferentes.
--
-- Dinheiro em numeric(12,2) e coluna de data em português, como o resto do
-- schema: a especificação que chegou pedia centavo inteiro e created_at, mas
-- isso deixaria despesa como a única tabela do sistema com uma convenção
-- própria. `dominio/dinheiro.ts` já faz a borda para todo o resto; despesa
-- usa o mesmo caminho.
--
-- `status` nasce calculado da data (pago se data_pagamento <= hoje, previsto
-- caso contrário) — ver `dominio/despesa.ts`. `recorrente_id` e
-- `diluir_meses` existem para a rodada 2 (job de recorrência) e ficam sempre
-- nulos por enquanto; não têm FK porque a tabela de recorrência ainda não
-- existe.

create type despesa_natureza    as enum ('fixa', 'variavel');
create type despesa_grupo_tipo  as enum ('operacional', 'retirada', 'nao_operacional');
create type despesa_status      as enum ('pago', 'previsto');

create table plano_conta (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,          -- '2.1'
  grupo_codigo int not null,
  grupo_nome   text not null,
  nome         text not null,
  natureza     despesa_natureza not null,
  tipo         despesa_grupo_tipo not null,
  ativa        boolean not null default true
);

-- Conta desativada some do formulário de lançamento (§ escopo), mas o
-- histórico que já a referencia continua de pé — por isso não há exclusão de
-- plano_conta, só o toggle.
comment on column plano_conta.ativa is
  'Desativar tira a conta do formulário de nova despesa. O histórico lançado com ela não muda.';

create table despesa (
  id             uuid primary key default gen_random_uuid(),
  plano_conta_id uuid not null references plano_conta(id),
  descricao      text not null,
  valor          numeric(12,2) not null,
  data_pagamento date not null,
  conta_saida_id uuid not null references conta(id),
  status         despesa_status not null,
  recorrente_id  uuid,
  diluir_meses   integer,
  criado_em      timestamptz not null default now(),

  constraint despesa_valor_positivo check (valor > 0)
);

create index despesa_data_idx  on despesa (data_pagamento);
create index despesa_conta_idx on despesa (plano_conta_id);

-- O movimento de caixa de uma despesa se acha e se desfaz junto, do mesmo
-- jeito que já existe para custo de veículo via movimento_caixa.custo_id.
-- Nulo quando a despesa nasce 'previsto': não há saída de caixa ainda.
alter table movimento_caixa add column despesa_id uuid references despesa(id) on delete cascade;
create index movimento_despesa_idx on movimento_caixa (despesa_id) where despesa_id is not null;


-- ============================================ seed do plano de contas (42)
-- Os grupos e o texto são exatamente os que a loja passou; [off] virou
-- ativa=false. Contagem por grupo: 5+7+6+5+3+3+3+3+3+4 = 42 — a especificação
-- anterior citava 43, mas a lista detalhada que a loja mandou depois tem 42
-- linhas; segui a lista detalhada, que é a mais recente e a mais precisa.
insert into plano_conta (codigo, grupo_codigo, grupo_nome, nome, natureza, tipo, ativa) values
  ('1.1', 1, 'Comercial e marketing', 'Tráfego pago',                    'variavel', 'operacional', true),
  ('1.2', 1, 'Comercial e marketing', 'Portais de anúncio',              'fixa',     'operacional', true),
  ('1.3', 1, 'Comercial e marketing', 'Agência e criação',               'fixa',     'operacional', false),
  ('1.4', 1, 'Comercial e marketing', 'Material gráfico e adesivagem',   'variavel', 'operacional', true),
  ('1.5', 1, 'Comercial e marketing', 'Brindes e eventos',               'variavel', 'operacional', true),

  ('2.1', 2, 'Ocupação e pátio', 'Aluguel',                       'fixa',     'operacional', true),
  ('2.2', 2, 'Ocupação e pátio', 'Energia',                       'variavel', 'operacional', true),
  ('2.3', 2, 'Ocupação e pátio', 'Água',                          'variavel', 'operacional', true),
  ('2.4', 2, 'Ocupação e pátio', 'Internet e telefonia',          'fixa',     'operacional', true),
  ('2.5', 2, 'Ocupação e pátio', 'Segurança e monitoramento',     'fixa',     'operacional', true),
  ('2.6', 2, 'Ocupação e pátio', 'Limpeza e conservação',         'fixa',     'operacional', true),
  ('2.7', 2, 'Ocupação e pátio', 'Manutenção do imóvel',          'variavel', 'operacional', true),

  ('3.1', 3, 'Pessoal', 'Salários',                          'fixa',     'operacional', false),
  ('3.2', 3, 'Pessoal', 'Encargos e FGTS',                   'fixa',     'operacional', false),
  ('3.3', 3, 'Pessoal', 'Vale-transporte e alimentação',     'fixa',     'operacional', false),
  ('3.4', 3, 'Pessoal', 'Uniforme',                          'variavel', 'operacional', false),
  ('3.5', 3, 'Pessoal', 'Treinamento',                       'variavel', 'operacional', false),
  ('3.6', 3, 'Pessoal', 'Rescisões',                         'variavel', 'operacional', false),

  ('4.1', 4, 'Administrativas', 'Contabilidade',              'fixa',     'operacional', true),
  ('4.2', 4, 'Administrativas', 'Software e assinaturas',     'fixa',     'operacional', true),
  ('4.3', 4, 'Administrativas', 'Material de escritório',     'variavel', 'operacional', true),
  ('4.4', 4, 'Administrativas', 'Serviços jurídicos',         'variavel', 'operacional', true),
  ('4.5', 4, 'Administrativas', 'Correios e cartório',        'variavel', 'operacional', true),

  ('5.1', 5, 'Financeiras', 'Tarifas bancárias',              'variavel', 'operacional', true),
  ('5.2', 5, 'Financeiras', 'Juros e IOF',                    'variavel', 'operacional', true),
  ('5.3', 5, 'Financeiras', 'Antecipação de recebíveis',      'variavel', 'operacional', true),

  ('6.1', 6, 'Tributos', 'Simples Nacional / DAS',        'variavel', 'operacional', true),
  ('6.2', 6, 'Tributos', 'IPTU',                          'fixa',     'operacional', true),
  ('6.3', 6, 'Tributos', 'Alvará e taxas municipais',     'fixa',     'operacional', true),

  ('7.1', 7, 'Seguros', 'Seguro do pátio e estoque',      'fixa', 'operacional', true),
  ('7.2', 7, 'Seguros', 'Responsabilidade civil',         'fixa', 'operacional', false),
  ('7.3', 7, 'Seguros', 'Seguro empresarial',             'fixa', 'operacional', false),

  ('8.1', 8, 'Frota interna', 'Combustível de deslocamento',        'variavel', 'operacional', true),
  ('8.2', 8, 'Frota interna', 'Manutenção de veículo da loja',      'variavel', 'operacional', true),
  ('8.3', 8, 'Frota interna', 'IPVA próprio',                       'fixa',     'operacional', true),

  ('9.1', 9, 'Retiradas de sócio', 'Pró-labore',                 'fixa',     'retirada', true),
  ('9.2', 9, 'Retiradas de sócio', 'Distribuição de lucro',      'variavel', 'retirada', true),
  ('9.3', 9, 'Retiradas de sócio', 'Reembolso de despesa',       'variavel', 'retirada', true),

  ('10.1', 10, 'Não operacionais', 'Multas e infrações',   'variavel', 'nao_operacional', true),
  ('10.2', 10, 'Não operacionais', 'Indenizações',         'variavel', 'nao_operacional', true),
  ('10.3', 10, 'Não operacionais', 'Perdas e sinistros',   'variavel', 'nao_operacional', true),
  ('10.4', 10, 'Não operacionais', 'Doações',              'variavel', 'nao_operacional', true);
