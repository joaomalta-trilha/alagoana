-- O extrato guardava o código do veículo no texto do movimento: "Pintura ·
-- V-10", "Venda V-13 · Chevrolet Tracker". Quem lê o caixa não decora código,
-- e a loja pediu o nome. O código novo já grava só o nome; esta migração
-- conserta o que ficou gravado antes.
--
-- Dois formatos, os dois que o sistema escrevia:

-- 1. Código no fim, sem nome: "Pintura · V-10" → "Pintura · Ford EcoSport".
--    Só casa o que termina exatamente em " · <código daquele veículo>", então
--    descrição digitada à mão fica como está.
update movimento_caixa m
   set descricao = left(m.descricao, length(m.descricao) - length(v.codigo))
                   || v.marca || ' ' || v.modelo
  from veiculo v
 where v.id = m.veiculo_id
   and m.descricao like ('% · ' || v.codigo);

-- 2. Código no meio, com o nome já ao lado: "Venda V-13 · Chevrolet Tracker"
--    → "Venda · Chevrolet Tracker". Aqui o nome não muda, só sai a sigla.
update movimento_caixa m
   set descricao = replace(m.descricao, ' ' || v.codigo || ' · ', ' · ')
  from veiculo v
 where v.id = m.veiculo_id
   and m.descricao like ('% ' || v.codigo || ' · %');
