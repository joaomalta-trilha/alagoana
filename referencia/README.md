# Referência

Os documentos que mandam neste projeto. Ficam versionados aqui para que
qualquer pessoa — ou qualquer sessão futura de trabalho — consiga entender as
decisões sem depender de arquivo solto em pasta de downloads.

| arquivo | o que é |
|---|---|
| [ESPECIFICACAO.md](ESPECIFICACAO.md) | A fonte de verdade. Quando código e especificação divergem, a especificação ganha até alguém decidir o contrário por escrito. |
| [patio-prototipo.html](patio-prototipo.html) | Referência visual e comportamental do desktop. |
| [patio-mobile.html](patio-mobile.html) | Referência visual e comportamental do mobile. |
| [PROMPTS-AJUSTES.md](PROMPTS-AJUSTES.md) | Ajustes pedidos depois do primeiro deploy. Aplicados em 16/08/2026. |
| [planilha-2026.xlsx](planilha-2026.xlsx) | A planilha que a loja mantém. É a fonte da frota — compra, venda, estoque e custo por carro. |
| [logo-alagoana.png](logo-alagoana.png) | A logomarca, como a loja mandou. É a fonte dos ícones — `npm run icones` deriva todos dela. |

Os protótipos são HTML de uma página, com os dados embutidos. Abrem no
navegador com dois cliques e não precisam de servidor nem de banco — é assim
que se confere um comportamento sem subir nada.

## O que mudou nesta versão dos protótipos

Duas coisas que o sistema **ainda não tem**, e que estão descritas em
`PROMPTS-AJUSTES.md`:

**Centavos em todo valor.** O `BRL` dos protótipos passou a formatar com duas
casas decimais. Hoje o sistema arredonda nos cartões e no painel, e só mostra
centavo na ficha — foi uma decisão que eu tomei e registrei, e que esta versão
reverte: os dados reais têm centavo (R$ 218,26 de lucro no Cruze) e a precisão
tem de aparecer.

**Tipo de veículo.** Os protótipos ganharam `tipo` (carro, moto, outro) e um
segundo catálogo, `CATALOGO_MOTO`, com 20 marcas e 170 modelos. A omissão
deliberada de marcas chinesas valia só para automóvel; em moto elas são volume
corrente no Nordeste e entram de propósito.

O catálogo de automóveis segue igual: 27 marcas e 268 modelos.

## A planilha manda na frota

A §9 da especificação descreve 16 veículos e 195 lançamentos, transcritos do
protótipo. Em 16/08/2026 a loja mandou a planilha atualizada: **20 veículos e
239 lançamentos**. A partir daí a frota vem da planilha, não do protótipo — os
protótipos continuam valendo como referência de layout e comportamento, que é
para o que foram feitos.

O que a §9 diz sobre a frota ficou histórico. A linha de base viva está no
topo de `apps/api/src/db/seed/conferir.ts`, e `npm run carga:frota` a
reconstrói da planilha do zero.

Duas contas da própria planilha não fecham, e foram deixadas como estão porque
consertá-las seria inventar dado: o rodapé do Tracker tem fórmula quebrada
(venda negativa, contra 83.000 na linha da transação) e o `TOTAL` do rodapé
declara 219.522,01 enquanto suas categorias somam 96.536,53. As transações
batem à vírgula — é delas que o sistema se alimenta.
