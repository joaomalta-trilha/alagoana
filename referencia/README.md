# Referência

Os documentos que mandam neste projeto. Ficam versionados aqui para que
qualquer pessoa — ou qualquer sessão futura de trabalho — consiga entender as
decisões sem depender de arquivo solto em pasta de downloads.

| arquivo | o que é |
|---|---|
| [ESPECIFICACAO.md](ESPECIFICACAO.md) | A fonte de verdade. Quando código e especificação divergem, a especificação ganha até alguém decidir o contrário por escrito. |
| [patio-prototipo.html](patio-prototipo.html) | Referência visual e comportamental do desktop. |
| [patio-mobile.html](patio-mobile.html) | Referência visual e comportamental do mobile. |
| [PROMPTS-AJUSTES.md](PROMPTS-AJUSTES.md) | Ajustes pedidos depois do primeiro deploy, ainda não aplicados. |

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
