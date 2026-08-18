-- Duas mudanças pedidas pela loja em 17/08/2026.
--
-- 1. Transferência entre contas do caixa. É um movimento como os outros, em
--    duas linhas — sai de uma conta, entra na outra — e as duas se conhecem
--    pelo `transferencia_id`. Sem esse par explícito, desfazer uma
--    transferência viraria adivinhação sobre data e valor.
--
-- 2. A comissão padrão vira uma linha só, de R$ 1.500 em nome da Alagoana.
--    Eram duas, Alagoana 1.000 e Victor 500.

alter type tipo_movimento add value 'transferencia';

alter table movimento_caixa add column transferencia_id uuid;

create index movimento_transferencia_idx
  on movimento_caixa (transferencia_id)
  where transferencia_id is not null;

-- Uma transferência tem exatamente duas pernas, de sinais opostos e mesmo
-- módulo. O banco não consegue exigir isso em `check` (é regra entre linhas),
-- mas a coluna deixa a checagem possível — e `db:conferir` a faz.

-- A §4.6 pede valores configuráveis, então o que está em `config` pode ter
-- sido editado pela loja. Só troca quando ainda é exatamente o padrão antigo:
-- sobrescrever escolha de gente seria pior do que ficar desatualizado.
update config
   set valor = '[{"beneficiario":"Comissão Alagoana","valor":150000}]'::jsonb
 where chave = 'comissoes_padrao'
   and valor = '[{"beneficiario":"Comissão Alagoana","valor":100000},
                 {"beneficiario":"Comissão Victor","valor":50000}]'::jsonb;
