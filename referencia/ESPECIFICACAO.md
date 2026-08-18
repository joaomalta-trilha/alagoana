# Sistema de Gestão — Alagoana Veículos

Especificação técnica para construção da versão 1.

Este documento é a fonte de verdade do projeto. Os protótipos `patio-prototipo.html` (desktop) e `patio-mobile.html` (mobile) são a referência visual e comportamental: **o sistema deve reproduzi-los**. Onde houver dúvida sobre layout, espaçamento ou texto de interface, consulte o protótipo antes de improvisar.

---

## 1. Contexto e escopo

Loja de veículos seminovos em Maceió/AL. Compra em leilão e de particulares, prepara o carro, anuncia e vende. Aceita carro na troca. Opera com três sócios e sem funcionários no sistema por enquanto.

Hoje o controle é feito em planilha, com uma aba por veículo e uma aba consolidada. O sistema substitui essa planilha.

**Na versão 1 entra:** cadastro de veículos, lançamento de custos, registro de venda, troca de veículo, controle de caixa multi-conta, aportes de sócios, garantia de 90 dias, painel de patrimônio e indicadores operacionais.

**Fora da versão 1:** contas a pagar, perfis de acesso por função, integração com portais de anúncio, integração automática com a tabela Fipe, CRM de leads, emissão de documentos.

---

## 2. Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Banco | PostgreSQL gerenciado | Relacional, transações, barato nesse porte |
| Backend | Node + TypeScript, API REST | Tipagem ajuda num domínio com muitas fórmulas |
| Frontend | React + TypeScript, PWA instalável | Evita loja de aplicativo; mesma base para desktop e mobile |
| Gráficos | Chart.js 4 | É o que os protótipos usam; migração direta |
| Auth | Sessão com cookie httpOnly | Simples, suficiente para uso interno |
| Deploy | Qualquer PaaS com deploy por push | Três usuários, poucas transações |

Volume esperado: ~20 veículos ativos, ~30 lançamentos por semana, 3 usuários simultâneos no máximo. Não otimize para escala.

**Decimais:** todo valor monetário em `NUMERIC(12,2)`. Nunca use ponto flutuante para dinheiro. No frontend, trabalhe em centavos inteiros ou use biblioteca decimal.

---

## 3. Modelo de dados

### 3.1 `usuario`

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| nome | text | |
| email | text unique | |
| senha_hash | text | bcrypt ou argon2 |
| papel | enum | Apenas `master` na v1 |
| ativo | boolean | default true |
| criado_em | timestamptz | |

Na v1 todos os usuários são `master` e enxergam tudo. O campo `papel` já existe para não exigir migração quando entrarem vendedores.

### 3.2 `conta`

Onde o dinheiro fica. Inclui a conta da empresa e o dinheiro em mãos de cada sócio.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| nome | text | "Ricardo", "Alagoana", "Victor", "João" |
| tipo | enum | `empresa` \| `socio` |
| socio_id | uuid FK → usuario | Nulo quando `tipo = empresa` |
| saldo_inicial | numeric(12,2) | Posição na data de implantação |
| ativa | boolean | |

Saldo nunca é armazenado. É sempre calculado: `saldo_inicial + SUM(movimento_caixa.valor)`.

### 3.3 `veiculo`

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| codigo | text unique | Sequencial exibido: `V-01`, `V-02`… |
| marca | text | Do catálogo, com opção de incluir nova |
| modelo | text | Do catálogo, dependente da marca |
| versao | text nullable | **Campo aberto**, sem catálogo. Ex.: "XEi 2.0", "Drive 1.3", "LTZ" |
| ano | integer nullable | Ano modelo |
| cor | text | Do catálogo, com opção de incluir nova |
| placa | text | Sempre gravada em maiúsculas |
| km | integer nullable | |
| data_compra | date | Obrigatório |
| valor_compra | numeric(12,2) | Obrigatório, > 0 |
| valor_anuncio | numeric(12,2) nullable | |
| fipe_compra | numeric(12,2) nullable | Preenchida à mão |
| fipe_hoje | numeric(12,2) nullable | Preenchida à mão, atualizada mensalmente |
| data_venda | date nullable | Nulo enquanto em estoque |
| valor_venda | numeric(12,2) nullable | |
| origem | enum | `compra` \| `troca` |
| troca_de_id | uuid FK → veiculo nullable | Preenchido quando entrou por troca |
| avaliacao_troca | numeric(12,2) nullable | Valor dado ao cliente no negócio |
| mercado_troca | numeric(12,2) nullable | Valor real estimado |
| agio_troca | numeric(12,2) nullable | `avaliacao − mercado`, quando positivo |
| criado_em, atualizado_em | timestamptz | |

Índices: `placa`, `data_venda` (nulo = em estoque), `troca_de_id`.

**Regra de vínculo de troca:** o veículo vendido não guarda referência ao que entrou. A relação é lida no sentido inverso — `SELECT * FROM veiculo WHERE troca_de_id = :id_do_vendido`. Isso evita referência circular.

### 3.4 `custo`

O coração do sistema. Cada gasto é uma linha; nunca um campo agregado no veículo.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| veiculo_id | uuid FK → veiculo | ON DELETE CASCADE |
| descricao | text | Obrigatório |
| categoria | text | Ver lista em 3.7 |
| data | date nullable | Nulo = custo previsto, ainda não realizado |
| valor | numeric(12,2) | > 0 |
| criado_em | timestamptz | |

Índices: `veiculo_id`, `categoria`, `data`.

**Custo com `data` nula** aparece na interface como "prevista". É o caso das comissões provisionadas no momento da compra. Entra no custo total normalmente.

### 3.5 `movimento_caixa`

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| conta_id | uuid FK → conta | |
| data | date | |
| descricao | text | |
| tipo | enum | `aporte` \| `retirada` \| `compra` \| `custo` \| `venda` |
| valor | numeric(12,2) | **Com sinal**: negativo para saída |
| veiculo_id | uuid FK nullable | ON DELETE CASCADE |
| custo_id | uuid FK nullable | ON DELETE CASCADE |
| criado_em | timestamptz | |

Índices: `conta_id`, `data`, `veiculo_id`, `custo_id`.

### 3.6 `aporte_socio`

Registro de capital, separado do saldo em mãos. Um aporte gera **duas** linhas: um `movimento_caixa` (o dinheiro entrou) e um `aporte_socio` (a participação aumentou).

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| socio_id | uuid FK → usuario | |
| conta_id | uuid FK → conta | Onde o dinheiro entrou ou saiu |
| movimento_id | uuid FK → movimento_caixa | |
| data | date | |
| tipo | enum | `aporte` \| `retirada` |
| valor | numeric(12,2) | Sempre positivo; o tipo define o sinal |
| observacao | text nullable | |

**Capital acumulado do sócio** = `SUM(aportes) − SUM(retiradas)`.

Não confunda com saldo de conta: o Ricardo pode ter R$ 38.088,62 em mãos e ter aportado R$ 120.000 ao longo do tempo. São números diferentes e ambos importam.

### 3.7 Catálogos

**Categorias de custo** — lista fechada no código, exatamente estas, nesta ordem:

```
Combustível, Transferência, Consulta, Peças, Pintura, Polimento, Reparo,
Manutenção, Revisão, Serviço, Guincho, IPVA, Imposto, Amarelinha, Cautelar,
Bateria, Chaveiro, Lâmpada, Patrocinado, Comissão, Retorno, Troca, Não detalhado
```

Duas têm regra especial:
- **Retorno** — só selecionável em veículo já vendido.
- **Não detalhado** — não aparece no seletor. Existe só para a carga inicial dos três carros sem detalhamento.

**Marcas, modelos e cores** — tabelas no banco (`marca`, `modelo`, `cor`), populadas na carga inicial com o catálogo do protótipo (27 marcas, 268 modelos, 16 cores). Marcas chinesas foram deliberadamente omitidas; a interface permite incluir qualquer uma pelo campo "+ Outra…". Versão **não** é catálogo — é texto livre.

---

## 4. Regras de negócio e fórmulas

Todas verificáveis contra os dados reais da carga inicial. Se o resultado divergir, o cálculo está errado.

### 4.1 Custo e resultado

```
custo_preparacao = SUM(custo.valor) do veículo
custo_total      = valor_compra + custo_preparacao
```

```
lucro       = valor_venda − custo_total
retorno_pct = lucro / custo_total × 100
```

> **Atenção:** o retorno é sobre o **investido**, não sobre a venda. É como a planilha da loja sempre calculou e é o número que os sócios reconhecem.
> Conferência: Honda City — 97.000 − 93.853,20 = 3.146,80 de lucro; 3.146,80 / 93.853,20 = **3,35%**.

```
ciclo_dias  = data_venda − data_compra          (vendido)
ciclo_dias  = hoje − data_compra                (em estoque)
retorno_mes = retorno_pct / (ciclo_dias / 30)
```

> Conferência: Honda City — 3,35 / (170/30) = **0,59% ao mês**.
> Só exiba `retorno_mes` quando `ciclo_dias >= 15`. Abaixo disso o número explode e engana.

```
lucro_projetado = valor_anuncio − custo_total           (em estoque, se houver anúncio)
projetado_pct   = lucro_projetado / custo_total × 100
```

### 4.2 Fipe

```
depreciacao     = fipe_hoje − fipe_compra
depreciacao_pct = depreciacao / fipe_compra × 100
anuncio_vs_fipe = (valor_anuncio / fipe_hoje − 1) × 100
```

Depreciação é movimento de mercado e **não entra no lucro**. Serve para avaliar a decisão de compra e a urgência de girar. Na carga inicial, `fipe_hoje = fipe_compra` para todos, porque a planilha só tinha um valor.

### 4.3 Envelhecimento do estoque

Faixas e cores, usadas na barra de dias em pátio e no gráfico do painel:

| Faixa | Cor | Hex |
|---|---|---|
| 0–30 dias | verde | `#2A8466` |
| 31–60 dias | verde-oliva | `#7FA83C` |
| 61–90 dias | âmbar | `#D89A2B` |
| 90+ dias | vermelho | `#B94B45` |

A barra preenche `min(100, ciclo_dias / 120 × 100)` por cento.

### 4.4 Garantia

Três meses corridos a partir da venda.

```
fim_garantia   = data_venda + 90 dias
dias_restantes = fim_garantia − hoje
ativa          = dias_restantes > 0
preenchimento  = clamp((90 − dias_restantes) / 90 × 100, 0, 100)
```

Enquanto ativa, exibir em âmbar com os dias restantes. Encerrada, cinza com "encerrada". Custos de categoria `Retorno` lançados nesse período reduzem o lucro do carro já vendido — o lucro de um veículo **não é definitivo** até a garantia fechar.

### 4.5 Venda com troca

Quando entra um veículo na troca, três coisas acontecem em **uma única transação**:

1. O veículo vendido recebe `data_venda` e `valor_venda`.
2. Um novo `veiculo` é criado com `origem = 'troca'`, `troca_de_id` apontando para o vendido, `data_compra` = data da venda.
3. Um `movimento_caixa` de venda é criado com valor **`valor_venda − avaliacao_troca`** — só o que entrou em dinheiro.

O valor de compra do veículo que entra depende da escolha do usuário:

| Modo | `valor_compra` do que entra | Efeito no vendido |
|---|---|---|
| **Pela avaliação** (padrão) | `avaliacao_troca` | Nenhum. O ágio fica embutido no carro novo. |
| **Pelo mercado** | `mercado_troca` | Cria um `custo` de categoria `Troca`, valor = ágio, na venda. |

O segundo modo é o recomendado, e a interface deve explicar por quê: supervalorizar a troca é desconto disfarçado, e sem esse lançamento o desconto some do histórico.

> Conferência: Tracker vendido a 89.000 com custo total 71.183,46, recebendo um Argo avaliado em 44.000 e valendo 40.000.
> Pela avaliação: lucro do Tracker = **17.816,54**; Argo entra por 44.000.
> Pelo mercado: Tracker ganha custo de 4.000 → lucro = **13.816,54**; Argo entra por 40.000.
> Nos dois casos, o caixa recebe **45.000**.

Se `avaliacao_troca > valor_venda`, o movimento de caixa fica negativo — a loja pagou a diferença. É válido; apenas valide o saldo da conta.

### 4.6 Comissões

Padrão da casa: **Comissão Alagoana R$ 1.500**, lançada como `custo` de categoria `Comissão`. *(Alterado em 17/08/2026, por decisão da loja: eram duas linhas — Alagoana R$ 1.000 e Victor R$ 500 — e viraram uma só, de mesmo total. O rateio entre os sócios não é assunto da ficha do carro.)*

Na tela de venda, um checkbox oferece lançá-las. Vem **marcado** por padrão, exceto quando o veículo já possui algum custo de categoria `Comissão` — caso em que vem desmarcado, porque já foram provisionadas na entrada. Os valores devem ser configuráveis, não fixos no código.

### 4.7 Caixa e patrimônio

```
saldo_conta   = saldo_inicial + SUM(movimento_caixa.valor da conta)
caixa_total   = SUM(saldo de todas as contas ativas)

estoque_custo    = SUM(custo_total) dos veículos sem data_venda
estoque_anuncio  = SUM(COALESCE(valor_anuncio, custo_total)) dos mesmos
patrimonio_total = caixa_total + estoque_custo
lucro_nao_realizado = estoque_anuncio − estoque_custo
patrimonio_futuro   = patrimonio_total + lucro_nao_realizado
```

> Conferência com a carga inicial: caixa 97.163,38 + estoque 269.086 = **366.249** de patrimônio; estoque a preço de anúncio 317.000 → **47.914** não realizado → **414.163** de patrimônio futuro.

**Integração obrigatória:** todo lançamento de custo, compra de veículo e venda oferece um campo de conta com a opção **"Não descontar do caixa"** em primeiro lugar. Quando uma conta é escolhida, gera-se o `movimento_caixa` correspondente. O sistema lembra a última conta usada na sessão e a pré-seleciona.

Antes de gravar qualquer saída, valide saldo. Mensagem: `Saldo insuficiente em {conta}: {saldo}.`

### 4.8 Edição e exclusão

**Editar veículo** altera todos os campos, inclusive data e valor de compra e de venda. Ao alterar esses valores, **atualize os `movimento_caixa` vinculados** — senão o extrato passa a contar história diferente da ficha.

**Excluir veículo** exige confirmação que lista, com números reais, o que será apagado: quantidade e soma dos custos, quantidade de movimentações e valor devolvido ao saldo, o registro da venda quando houver, e o vínculo de troca quando houver.

Ao excluir:
- Custos e movimentações vão junto (cascade).
- O veículo vinculado por troca **permanece no sistema**, apenas com o vínculo desfeito nos dois sentidos.

**Excluir um custo** remove o `movimento_caixa` vinculado, devolvendo o valor ao saldo.

---

## 5. Autenticação

Login por e-mail e senha, sessão em cookie httpOnly, expiração em 30 dias com renovação por uso. Todos os usuários da v1 têm papel `master`.

Prepare as consultas para receberem filtro por papel desde já — quando entrarem vendedores, a regra combinada é: vendedor vê estoque e cria venda, mas **não vê valor de compra, custos nem margem**, e enxerga só as próprias comissões. Deixar isso previsto evita reescrever a camada de dados depois.

---

## 6. Telas

Cinco telas no desktop e cinco no mobile, com a mesma informação e arquiteturas diferentes. Os protótipos são a referência exata.

### 6.1 Estrutura de navegação

**Desktop:** barra superior azul `#0032D3` com o logo à esquerda, abas ao centro-direita (Painel, Estoque, Vendas, Caixa) e botão "Lançar custo" à direita. Abaixo, barra branca de filtros: Período, Marca, Faixa de preço, e "Limpar filtros". Conteúdo com largura máxima de 1400px.

**Mobile:** barra superior azul com logo e nome da tela. Navegação em **barra inferior fixa** com quatro ícones. Botão flutuante "+ Custo" acima da barra, à direita, presente em todas as telas exceto Caixa. Formulários abrem como *bottom sheet*.

Os filtros do desktop afetam todas as telas simultaneamente. O mobile da v1 não tem filtros.

### 6.2 Painel

**Bloco Patrimônio** — barra de composição (azul = caixa, verde = estoque) com legenda percentual, seguida de dois grupos:

- `HOJE` — Patrimônio total (destacado, barra vertical sólida à esquerda), Estoque ao custo, Caixa disponível
- `SE TODO O ESTOQUE SAIR PELO PREÇO DE ANÚNCIO` — Patrimônio futuro (destacado, barra vertical tracejada), Estoque a preço de anúncio, Lucro não realizado

Regra visual que deve ser preservada: **cor identifica natureza** (azul = dinheiro, verde = mercadoria) e **peso identifica certeza** (sólido = fato, cinza claro = projeção). Rodapé com a ressalva de que a projeção supõe venda pelo preço pedido, sem desconto e sem novos custos.

No desktop, três colunas por grupo. No mobile, coluna única — mesmo componente, media query.

**Indicadores operacionais:** Em estoque, Capital imobilizado, Giro médio, Retorno médio, Lucro realizado, Parados +90 dias (em vermelho quando houver). No mobile, acrescentar "Em garantia".

**Gráficos** (desktop, seis): envelhecimento do estoque; resultado por mês (barras de lucro + linha de quantidade); dispersão retorno × ciclo de venda; custo por categoria (dez maiores, horizontal); anúncio contra a Fipe; retorno médio por marca.
**Mobile:** apenas envelhecimento e custo por categoria (sete maiores).

### 6.3 Estoque

Cabeçalho com contagem de carros e capital investido, e botão "Lançar carro".

**Desktop — tabela**, ordenada por dias em pátio decrescente:

| Coluna | Conteúdo |
|---|---|
| Veículo | Nome em destaque; abaixo ano · cor · km, e tag "troca" quando aplicável |
| Placa | Distintivo no padrão Mercosul |
| Data de compra | |
| Compra | faixa cinza |
| Custo | faixa cinza, com "N lanç." abaixo |
| Custo total | faixa destacada entre divisórias, em negrito |
| Anúncio | faixa verde, com "Fipe R$ X" abaixo |
| Lucro projetado | faixa verde, com percentual abaixo |
| Dias em pátio | barra de envelhecimento + número |

As três faixas de fundo são essenciais: cinza = o que saiu, destaque = subtotal, verde = o que pode entrar. Quando `valor_anuncio <= custo_total`, as células de anúncio e lucro projetado ficam **vermelhas** — não existe negociação possível ali que não seja prejuízo.

**Mobile — cartões**: nome e placa no topo, três números (custo total, anúncio, lucro projetado), barra de envelhecimento com "N dias em pátio" ao pé.

### 6.4 Vendas

**Consolidado no topo:** carros vendidos, total investido, total faturado, lucro total, retorno sobre o investido, ciclo médio, lucro médio por carro, custo de garantia, carros em garantia.

**Tabela** (desktop) com as mesmas faixas do estoque, mais colunas de Lucro (valor e percentual) e **Garantia** (mini-barra com dias restantes ou "encerrada"). Linha de totais no rodapé.

**Mobile:** consolidado resumido em quatro linhas e cartões por venda, cada um com a barra de garantia.

### 6.5 Ficha do veículo

Ordem dos blocos:

1. **Cabeçalho** — placa Mercosul grande, código, marca/modelo, situação, botões **Editar** e **Excluir**, e a ficha técnica (marca, modelo, versão, ano, km, cor, placa)
2. **Linha do tempo** — data de compra, último custo lançado, data de venda, ciclo
3. **Vínculo de troca**, quando houver, nos dois sentidos, com botão para abrir o outro veículo
4. **Garantia** (vendido) ou botão **Marcar como vendido** (em estoque)
5. **Análise financeira** — dois grupos com títulos ("O que o carro custou" / "O que o carro rendeu"), cada linha com sinal (−, +, =), custo total em faixa cinza e resultado em faixa verde ou vermelha
6. **Referência Fipe** — Fipe na compra, Fipe hoje, depreciação, variação, e botão para atualizar
7. **Custos lançados** — tabela com descrição, categoria, data, valor, botão de remover por linha, total no rodapé, e botão "Lançar custo"
8. **Custo por categoria** — gráfico de barras horizontais, papel secundário

### 6.6 Caixa

Cartões de saldo por conta, mais o consolidado em destaque azul. Botão "Registrar aporte". Extrato com data, descrição, tipo, conta e valor com sinal e cor.

Acrescentar na v1 (não existe no protótipo): **quadro de capital por sócio**, com aportes acumulados, retiradas e capital líquido de cada um.

### 6.7 Lançamento rápido de custo

A tela mais usada do sistema. Acessível de qualquer lugar.

Contém, nesta ordem:
1. **Atalhos** gerados do histórico — agrupa lançamentos por descrição + categoria, conta repetições, sugere os oito mais frequentes com o valor mais comum. Um toque preenche descrição, categoria e valor.
2. **Veículo**, agrupado em "Em pátio" e "Vendidos"
3. **Rateio** — caixa "Lançar em vários carros" que abre seleção múltipla e a escolha entre *mesmo valor em cada* ou *dividir o valor entre eles*
4. Descrição, categoria, data, valor
5. **Pagar com** — conta ou "Não descontar do caixa"
6. Botões **Salvar** e **Salvar e lançar outro**

"Salvar e lançar outro" mantém o painel aberto, preserva veículo e data, limpa descrição e valor. A data escolhida fica lembrada na sessão. No desktop, `Esc` fecha e `Enter` salva e continua.

O rateio existe porque o custo de tráfego pago é dividido entre os carros anunciados: em 01/08/2026 o mesmo valor de R$ 369,46 foi lançado em três veículos.

---

## 7. Design

### 7.1 Cores

```
--azul-marca:     #0032D3   identidade, ações primárias, caixa
--azul-marca-esc: #0026A6   hover
--ink:            #15181A   texto principal
--ink2:           #4A524F   texto secundário
--ink3:           #858B87   rótulos
--paper:          #F1F3F0   fundo
--card:           #FFFFFF
--line:           #DDE1DB   divisórias
--line2:          #C6CCC4   bordas de campo
--verde:          #14503F   valores positivos
--verde2:         #2A8466   estoque, gráficos
--verde-bg:       #E4EFE9
--ambar:          #A96200   garantia ativa, atenção
--ambar-bg:       #F8EEDD
--vermelho:       #93262A   prejuízo, exclusão
--vermelho-bg:    #F7E6E6
```

Regra: **azul é identidade e dinheiro em conta; verde é resultado positivo e mercadoria; âmbar e vermelho são risco.** Botões primários em azul. Não use verde para ação — ele carrega significado numérico.

### 7.2 Tipografia

- Títulos e rótulos: **Archivo** 500/600, `letter-spacing: -0.01em`; rótulos em maiúsculas com `letter-spacing: 0.07em`, 11px
- Texto: **IBM Plex Sans** 400/500/600
- **Todo número**: **IBM Plex Mono** com `font-variant-numeric: tabular-nums`

Números em fonte monoespaçada não é escolha estética: alinha as casas decimais em colunas e permite comparar valores de relance.

### 7.3 Componentes recorrentes

**Placa Mercosul** — retângulo branco, borda preta, tarja azul superior com "BRASIL", número em monoespaçada. Três tamanhos: 104px (tabela), 150px (cartão mobile), 174px (ficha).

**Barra de envelhecimento** — trilho cinza de 5px, preenchimento colorido por faixa, número de dias ao lado na cor da faixa.

**Barra de garantia** — mesma estrutura, âmbar quando ativa, cinza quando encerrada.

**Faixas de coluna** — fundos `#FAFAF7` (saída), `#F0F3EF` com divisórias laterais (subtotal), `#ECF4EF` (entrada).

Raio de borda: 10–12px em cartões, 7px em campos, 99px em pílulas. Espaçamento em múltiplos de 4px.

### 7.4 Mobile

Alvos de toque com no mínimo 44px. Campos com fonte de 16px, para o iOS não dar zoom ao focar. `inputmode="decimal"` em valores e `inputmode="numeric"` em ano e km. Respeitar `env(safe-area-inset-*)`. Honrar `prefers-reduced-motion`.

---

## 8. Textos de interface

O texto do protótipo faz parte da especificação. Ele explica o número em vez de apenas nomeá-lo. Alguns que devem ser preservados:

- "Cada gasto do veículo, com data. É daqui que sai o custo total."
- "A linha de baixo é projeção, não resultado: supõe venda pelo preço pedido, sem desconto no fechamento e sem novos custos até lá."
- "Janela em que retornos do comprador ainda são por sua conta."
- "Entrada e saída de capital dos sócios."
- "Ágio de R$ X na troca. Você avaliou o carro acima do que ele vale — na prática, um desconto embutido nesta venda."

Mensagens de validação são específicas, nunca genéricas:

| Situação | Mensagem |
|---|---|
| Custo incompleto | Preencha descrição, data e um valor maior que zero. |
| Retorno em carro no pátio | Retorno só pode ser lançado em carro já vendido. |
| Saldo insuficiente | Saldo insuficiente em {conta}: {saldo}. |
| Veículo incompleto | Preencha marca, modelo, placa, data de compra e um valor de compra maior que zero. |
| Data de venda inválida | A data da venda não pode ser anterior à da compra. |
| Rateio sem seleção | Selecione pelo menos um carro para o rateio. |

---

## 9. Carga inicial

Extraia de `patio-prototipo.html`, no array `frota`: **16 veículos e 195 lançamentos de custo** transcritos da planilha real, de julho de 2025 a agosto de 2026.

Saldos de conta na implantação:

| Conta | Tipo | Saldo |
|---|---|---|
| Ricardo | sócio | R$ 38.088,62 |
| Alagoana | empresa | R$ 59.074,76 |
| Victor | sócio | R$ 0,00 |
| João | sócio | R$ 0,00 |

**Não gere movimentações retroativas** para os 16 veículos. Os saldos acima já são a posição líquida atual; lançar o histórico zeraria o caixa artificialmente. O extrato começa vazio.

**Validação obrigatória após a carga** — se qualquer número divergir, a importação está errada:

| Conferência | Valor esperado |
|---|---|
| Veículos vendidos | 11 |
| Veículos em estoque | 5 |
| Total faturado | R$ 661.467,24 |
| Lucro total | R$ 64.195,53 |
| Investido nos vendidos | R$ 597.271,71 |
| Retorno sobre o investido | 10,7% |
| Ciclo médio | 75 dias |
| Estoque ao custo | R$ 269.086,08 |
| Caixa total | R$ 97.163,38 |
| Patrimônio total | R$ 366.249,46 |

**Pendência conhecida:** Kicks S, Polo Highline e Hyundai Tucson entraram com um lançamento único de categoria `Não detalhado`, porque a planilha não trazia o detalhamento. Vale recuperar esses lançamentos antes de considerar o gráfico de categorias confiável.

**Campos ausentes na origem:** km de todos os veículos, valor de anúncio dos vendidos (exceto Honda City) e versão de todos. Ficam nulos e são preenchidos com o uso.

---

## 10. Ordem de construção

1. **Banco e autenticação.** Migrações, seed dos catálogos, login. Sem interface.
2. **Carga inicial.** Importar os 16 veículos e rodar a tabela de conferência da seção 9. Só avance quando os dez números baterem.
3. **API.** CRUD de veículo, custo, venda, troca, caixa e aporte, com as fórmulas da seção 4 calculadas no backend. Testes automatizados usando os exemplos numéricos deste documento como casos.
4. **Mobile.** Estoque, ficha, lançamento rápido, caixa. É onde o dado entra.
5. **Desktop.** Painel completo, tabelas, gráficos.
6. **Rodar em paralelo com a planilha por um mês.** Lançar nos dois. Divergência de total é bug a investigar.

---

## 11. Duas coisas que o protótipo não tem

Decidido nesta especificação, ainda não construído nos arquivos HTML:

- **Campo `versao`** no veículo — texto livre, exibido na ficha e junto ao modelo nas listagens
- **Capital por sócio** — tabela `aporte_socio` e o quadro correspondente na tela de Caixa

Fora isso, o protótipo é a especificação visual completa.
