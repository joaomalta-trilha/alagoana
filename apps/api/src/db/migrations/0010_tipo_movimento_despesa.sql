-- `tipo_movimento` ganha 'despesa', sozinho na própria transação — o mesmo
-- motivo pelo qual 'transferencia' (0005) e 'repasse' (0008) vieram cada um
-- em sua migration: `alter type ... add value` não pode ser usado na mesma
-- transação em que o valor novo é referenciado.

alter type tipo_movimento add value 'despesa';
