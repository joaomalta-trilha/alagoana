-- A Fipe deixa de ser digitada à mão.
--
-- `fipe_compra` e `fipe_hoje` já existiam, preenchidas na unha. O que faltava
-- era saber QUAL versão da Fipe é cada carro: ela tem 116 versões de HB20, e
-- entre as de 2014 a mais barata e a mais cara diferem 31%. Sem o código, a
-- consulta automática escreveria um número que parece Fipe e não é.
--
-- A versão é escolhida uma vez, quando o carro entra, e os códigos abaixo
-- ficam gravados. Daí em diante a Fipe de hoje se atualiza sozinha quando a
-- tabela vira o mês; a Fipe na compra nunca mais muda.

alter table veiculo
  add column fipe_marca_codigo  text,
  add column fipe_modelo_codigo text,
  add column fipe_ano_codigo    text,
  -- O nome da versão e o código público ("015003-1"), para a tela mostrar o
  -- que foi escolhido e para conferir de fora do sistema.
  add column fipe_versao        text,
  add column fipe_codigo        text,
  -- "agosto de 2026" — a referência da tabela que gerou `fipe_hoje`. É por ela
  -- que se sabe que virou o mês; contar dias erraria, porque a data de
  -- publicação não é fixa no calendário.
  add column fipe_referencia    text,
  add column fipe_atualizada_em timestamptz;

-- Ou os três códigos existem, ou nenhum: meia escolha não consulta nada.
alter table veiculo add constraint fipe_escolha_completa check (
  (fipe_marca_codigo is null and fipe_modelo_codigo is null and fipe_ano_codigo is null)
  or
  (fipe_marca_codigo is not null and fipe_modelo_codigo is not null and fipe_ano_codigo is not null)
);

create index veiculo_fipe_idx on veiculo (fipe_referencia)
  where fipe_modelo_codigo is not null and data_venda is null;

comment on column veiculo.fipe_compra is
  'Fixa: a Fipe do dia em que o carro entrou. Nunca é reescrita.';
comment on column veiculo.fipe_hoje is
  'Varia: reescrita a cada tabela nova, quando há códigos gravados.';
