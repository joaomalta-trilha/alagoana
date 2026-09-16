-- Repasse — pedido pela loja em 14/09/2026.
--
-- Carro recebido só para viabilizar outra venda, repassado pelo mesmo valor
-- em seguida — o Ford Ka que já vivia em `frota.json` com essa observação,
-- só que agora com um lugar próprio em vez de texto livre.
--
-- Mecanicamente é igual à troca: entra pela mesma coluna `troca_de_id`, o
-- caixa da venda recebe `valor_venda − avaliação` do mesmo jeito, e não paga
-- comissão pela mesma razão de sempre — não há margem real para tirar dela.
-- A diferença é só a origem: `repasse` em vez de `troca`, para que a interface
-- identifique o carro e o painel e os totais de venda o deixem de fora, já
-- que o lucro dele é zero por definição e contá-lo maquiaria o retorno médio.
--
-- Só o valor novo do enum, sozinho na transação: `alter type ... add value`
-- não pode ser usado na mesma transação em que é criado, e é por isso que a
-- migração de 'transferencia' (0005) também veio sem mais nada junto.

alter type origem_veiculo add value 'repasse';
