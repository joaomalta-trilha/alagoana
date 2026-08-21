# API — etapa 3 da §10

Todas as rotas abaixo de `/api` exigem sessão (§5). Sem cookie válido, `401`.

**Dinheiro vai e volta em centavos inteiros.** `R$ 93.853,20` é `9385320`. Não
existe valor monetário fracionário nesta API: `1000.5` é recusado com `400`. É
a §2 levada a sério na fronteira — o lugar onde a regra ou vale ou já se
perdeu. Datas são `AAAA-MM-DD`.

Em todo lançamento que mexe em dinheiro, `contaId` é opcional: omitir ou mandar
`null` é exatamente a opção **"Não descontar do caixa"** que a §4.7 manda pôr em
primeiro lugar no seletor. Com conta escolhida, o `movimento_caixa` nasce junto
e o saldo é validado antes.

## Sessão

| | |
|---|---|
| `POST /api/sessao` | `{email, senha}` → cookie de 30 dias |
| `DELETE /api/sessao` | encerra |
| `GET /api/eu` | quem está logado |

## Catálogos

| | |
|---|---|
| `GET /api/catalogos` | marcas com modelos, cores, categorias, contas e sócios |
| `POST /api/catalogos/marcas` | `{nome}` — o "+ Outra…" da §3.7 |
| `POST /api/catalogos/modelos` | `{marca, nome}` |
| `POST /api/catalogos/cores` | `{nome}` |

Gravar um veículo com marca ou modelo fora do catálogo **não é erro**: o
catálogo aprende sozinho. `versao` é texto livre e nunca vira catálogo.

## Veículos

| | |
|---|---|
| `GET /api/veiculos?situacao=estoque\|vendido\|todos` | listagem com a §4 calculada |
| `POST /api/veiculos` | cadastra; gera o código `V-NN` |
| `GET /api/veiculos/:id` | ficha da §6.5: custos, categorias, troca e extrato |
| `PATCH /api/veiculos/:id` | edita qualquer campo e **reescreve os movimentos vinculados** (§4.8) |
| `GET /api/veiculos/:id/exclusao` | prévia com os números reais do que será apagado |
| `DELETE /api/veiculos/:id` | exclui; o carro ligado por troca sobrevive sem o vínculo |
| `POST /api/veiculos/:id/venda` | venda, trocas e comissões numa transação só |
| `GET /api/fipe/versoes` | `?tipo&marca&modelo` — as versões candidatas, com a marca já resolvida |
| `GET /api/fipe/anos` | `?tipo&marca&modelo&ano` — os anos de uma versão, com o do veículo apontado |
| `PUT /api/veiculos/:id/fipe` | grava a versão escolhida e consulta o valor |
| `POST /api/fipe/atualizar` | reescreve a Fipe de hoje dos carros em pátio |
| `GET /api/veiculos/:id/venda` | prévia do desfazer: o que sai do caixa, que comissões somem, e o motivo quando não dá |
| `DELETE /api/veiculos/:id/venda` | desfaz a venda e devolve o carro ao estoque |

A venda aceita:

```json
{
  "dataVenda": "2026-08-09",
  "valorVenda": 8900000,
  "contaId": "…",
  "lancarComissoes": true,
  "troca": {
    "marca": "Fiat", "modelo": "Argo", "cor": "Branco", "placa": "ARG2B34",
    "avaliacao": 4400000, "mercado": 4000000, "modo": "mercado"
  }
}
```

`modo` decide onde o ágio aparece (§4.5). Pela **avaliação**, ele fica embutido
no carro que entra. Pelo **mercado**, vira um custo de categoria `Troca` na
venda — que é o modo recomendado, porque supervalorizar a troca é desconto
disfarçado e sem esse lançamento o desconto some do histórico. O caixa recebe
`valorVenda − avaliacao` nos dois: o modo move resultado, nunca dinheiro.

`lancarComissoes` omitido segue a regra do checkbox da §4.6 — marcado, exceto
quando o veículo já tem custo de categoria `Comissão`.

## Custos

| | |
|---|---|
| `GET /api/custos/atalhos` | os oito mais frequentes, com o valor mais comum (§6.7) |
| `POST /api/custos` | lança em um carro ou rateia em vários |
| `DELETE /api/custos/:id` | exclui e devolve o valor ao saldo |

```json
{
  "veiculoIds": ["…", "…", "…"],
  "descricao": "Tráfego pago", "categoria": "Patrocinado",
  "data": "2026-08-01", "valor": 36946,
  "modoRateio": "dividir",
  "contaId": "…"
}
```

`dividir` reparte sem perder centavo — 369,46 entre três vira 123,16 + 123,15 +
123,15, e o centavo que sobra vai para os primeiros na ordem do código. `mesmo`
repete o valor inteiro em cada carro. Um único veículo pode ir em `veiculoId`.

`previsto: true` grava custo sem data (§3.4): entra no custo total e não toca no
caixa, porque ainda não aconteceu.

## Fipe

A Fipe não conhece "Hyundai HB20": tem 116 versões, e entre as de 2014 a mais
barata e a mais cara diferem 31%. Por isso a versão é escolhida uma vez, na
mão, e os códigos ficam no veículo (`fipe_marca_codigo`, `fipe_modelo_codigo`,
`fipe_ano_codigo`). A marca sai sozinha — das 47 do catálogo, 44 casam por
caixa e três têm apelido conhecido (GM - Chevrolet, VW - VolksWagen, Kia
Motors). O modelo casa por palavra, não por prefixo: "Ka Sedan" está em "Ka
1.5 Sedan SE" e "Fazer 250" em "YS 250 FAZER".

`fipe_compra` é fixa — o retrato do dia da entrada, gravada no lançamento e
nunca reescrita, nem quando a versão é corrigida. `fipe_hoje` varia: a rotina
reconsulta quando `fipe_referencia` deixa de bater com a tabela publicada
("agosto de 2026"), e roda de carona na leitura do painel, no máximo uma vez a
cada doze horas.

A fonte é gratuita e sem contrato de disponibilidade, então **nada aqui
derruba operação da loja**: consulta que falha devolve nulo, o carro entra do
mesmo jeito e a Fipe entra depois, pela ficha. A consulta acontece fora da
transação do veículo — rede aberta dentro de transação prende conexão do
banco.

## Caixa

| | |
|---|---|
| `GET /api/caixa` | saldos, consolidado, capital por sócio e extrato |
| `POST /api/aportes` | `{socioId, contaId, tipo, valor, data, observacao}` |
| `POST /api/transferencias` | `{origemId, destinoId, valor, data, observacao}` |
| `GET /api/transferencias/:id` | prévia do que apagar vai mexer, e o motivo quando não dá |
| `DELETE /api/transferencias/:id` | apaga as duas pernas juntas |

`tipo` é `aporte` ou `retirada`, e `valor` é sempre positivo — o tipo define o
sinal. Um aporte grava duas linhas (§3.6): o movimento de caixa e a
participação. São números diferentes e ambos importam.

A transferência também grava duas linhas, uma em cada conta, unidas por
`transferencia_id`. Não é aporte: o dinheiro não entrou nem saiu da empresa,
só mudou de bolso, e por isso `capital_socio` não se mexe. Recusa origem igual
ao destino, valor não positivo e saldo que não cobre.

Apagar leva as duas pernas juntas — meia transferência é dinheiro sumindo ou
nascendo — e recusa quando o destino já gastou o dinheiro, porque tirá-lo
levaria a conta ao negativo. Não é estorno, não deixa linha no extrato: uma
transferência lançada errada é erro de digitação, não fato do negócio. O que
foi apagado fica em `evento`.

No extrato, `veiculo` é `{codigo, descricao}` — o nome para ler, o código para
achar. A descrição do movimento nomeia o carro e não traz sigla: quem lê o
caixa não decora código de veículo. A migração 0006 corrigiu o que já estava
gravado nos dois formatos antigos.

`GET /api/caixa` devolve `transferenciaId` em cada linha do extrato, e é ele
que diz quais podem ser apagadas ali. Venda, compra, custo e aporte nascem de
outro lugar e se desfazem lá; apagar a linha do extrato deixaria a ficha do
veículo contando outra história.

Desfazer a venda apaga o que a venda criou — a entrada no caixa, as comissões
daquele dia e o ágio da troca — e nada além disso: o custo anterior fica, e o
carro volta preparado. Recusa em dois casos, ambos com o motivo em
`impedimento`: quando entrou um carro na troca (ele ficaria sem a origem que o
explica) e quando o dinheiro da venda já foi gasto, porque tirá-lo levaria a
conta ao negativo.

## Painel e vendas

| | |
|---|---|
| `GET /api/painel` | patrimônio, indicadores e os seis gráficos da §6.2 |
| `GET /api/vendas` | consolidado da §6.4 mais a lista de vendidos |

## Filtros (§6.1)

`GET /api/veiculos`, `GET /api/painel` e `GET /api/vendas` aceitam os mesmos
três parâmetros, porque os filtros do desktop afetam todas as telas ao mesmo
tempo:

| | |
|---|---|
| `periodo` | janela em dias — `30`, `90`, `180`. A data que conta é a da venda, se houve; a da compra, se o carro ainda está no pátio |
| `marca` | nome exato |
| `faixa` | `a` até R$ 60 mil, `b` de 60 a 100 mil, `c` acima. O preço de referência é a venda, ou o anúncio, ou a compra — nessa ordem |

Parâmetro ausente ou sem sentido é ignorado, não recusado: filtro é recorte de
leitura, e um valor esquisito na URL não deve derrubar a tela.

O filtro é aplicado uma vez, na listagem de veículos, e painel e vendas herdam
o recorte. **O caixa não é filtrado** — dinheiro em conta não tem marca nem
faixa de preço. Por isso o painel devolve `recorteAtivo: true` quando há filtro
em vigor: o patrimônio ali mistura um caixa inteiro com um estoque parcial, e a
tela precisa dizer isso em vez de deixar o número mentir sozinho.

## Erros

`422` é recusa de regra de negócio, e a mensagem é a da §8, para ser exibida
como está. `400` é corpo malformado. `404` é registro ou rota inexistente.
`405` lista os métodos que o caminho aceita. `500` diz só "Erro interno." — o
detalhe fica no log do servidor, porque texto de erro de banco não é interface.

## Papel (§5)

Na v1 todos são `master` e veem tudo. O filtro para `vendedor` já existe e é
aplicado na saída, num lugar só: some `valorCompra`, `custoTotal`, `lucro`,
`retornoPct` e o resto da margem; ficam placa, anúncio e dias em pátio.
