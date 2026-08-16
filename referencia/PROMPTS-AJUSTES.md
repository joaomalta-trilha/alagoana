# Prompts — ajustes pós-deploy

Os protótipos atualizados (`patio-prototipo.html` e `patio-mobile.html`) já contêm as duas alterações implementadas e testadas. Coloque as versões novas no repositório antes de enviar os prompts — o Claude Code vai ler o catálogo e as regras direto delas.

---

## Prompt A — Centavos em todos os valores

```
Os valores monetários estão sendo exibidos arredondados. Os dados reais têm
centavos (R$ 59.074,76 de saldo, R$ 4.183,46 de custo, R$ 218,26 de lucro no
Cruze) e essa precisão precisa aparecer.

1. Formatação
   Toda exibição de dinheiro passa a usar duas casas decimais, no padrão
   brasileiro:

   Number(v).toLocaleString('pt-BR', {
     minimumFractionDigits: 2,
     maximumFractionDigits: 2
   })

   Centralize isso numa única função de formatação e use em todo lugar. Se
   houver mais de uma implementação espalhada, unifique.

2. Campos de entrada
   Todo input de valor precisa de step="0.01". Verifique especialmente os que
   estiverem com step="100" ou step="10" — eles travam a digitação de
   decimais. No mobile, mantenha inputmode="decimal".

3. Indicadores do painel
   Os KPIs que hoje mostram forma abreviada ("R$ 269 mil") passam a mostrar o
   valor cheio. Ficaria inconsistente ter centavo na tabela e arredondamento
   por milhar logo acima. Reduza o tamanho da fonte do número de 26px para
   22px e adicione white-space: nowrap para não quebrar linha.

4. Espaço
   Valores com centavos ocupam cerca de três caracteres a mais. Verifique e
   ajuste onde houver quebra de linha indevida:
   - Consolidado de vendas: colunas de largura mínima maior (175px)
   - Rodapé de totais das tabelas: white-space: nowrap
   - Largura mínima da tabela de vendas e do container da página

Não mexa nos eixos dos gráficos — ali a forma abreviada ("R$ 20k") continua
sendo a leitura certa.

Depois de aplicar, confira que estes valores aparecem exatos em algum lugar
do sistema: R$ 661.467,24 de faturamento, R$ 64.195,53 de lucro,
R$ 97.163,38 de caixa, R$ 366.249,46 de patrimônio.
```

---

## Prompt B — Tipo de veículo e catálogo de motos

```
Hoje o cadastro assume que todo veículo é carro. Na prática entra moto na
troca, e eventualmente reboque ou implemento.

1. Modelo de dados
   Adicione o campo `tipo` na tabela veiculo: enum carro | moto | outro,
   default 'carro'. Todos os registros existentes são carro.

   A tabela `marca` ganha uma coluna `tipo` (carro ou moto), e a consulta de
   marcas sempre filtra pelo tipo escolhido no formulário.

2. Catálogo de motos
   Extraia o objeto CATALOGO_MOTO de patio-prototipo.html: 20 marcas e 170
   modelos. Inclui as japonesas com linha completa (Honda de CG 160 a Africa
   Twin, Yamaha de Factor a Ténéré), as premium de revenda (BMW, Harley,
   Triumph, Ducati, KTM, Royal Enfield) e as nacionais e de origem chinesa já
   consolidadas no Brasil (Haojue, Shineray, Dafra, Traxx, Kasinski).

   Importante: a decisão de omitir marcas chinesas valia só para automóvel.
   Em moto elas são volume corrente, especialmente no Nordeste, e estão
   incluídas de propósito.

3. Interface
   Todo formulário de veículo — cadastro, edição e carro recebido na troca —
   ganha um seletor "Tipo: Carro / Moto / Outros" ANTES de marca e modelo,
   porque ele determina qual catálogo carregar.

   | Tipo   | Marca                    | Modelo                    |
   |--------|--------------------------|---------------------------|
   | Carro  | select do catálogo carro | select dependente da marca|
   | Moto   | select do catálogo moto  | select dependente da marca|
   | Outros | texto livre              | texto livre               |

   Trocar o tipo recarrega marca e modelo e limpa o que estava selecionado.
   O tipo "Outros" existe para reboque, náutico e implemento — não faz
   sentido manter catálogo para o que é exceção.

4. Exibição
   - Nas listagens, veículo que não é carro ganha uma tag discreta ("moto",
     "outro") ao lado do ano e da cor
   - Na ficha, o tipo é o primeiro item da ficha técnica
   - Os rótulos que dizem "carros" viram "veículos" onde a contagem pode
     incluir moto (contador do estoque, por exemplo)

O formulário de troca é o caso principal: é comum receber moto na troca de um
carro, e o fluxo de ágio e vínculo já existente continua igual,
independente do tipo.

Referência de implementação completa: patio-prototipo.html e
patio-mobile.html, que já têm isso funcionando.
```

---

## Prompt C — Auditoria completa

Este substitui a análise que eu faria se conseguisse acessar o sistema. Ele tem o repositório e consegue rodar tudo.

```
Quero uma auditoria completa do sistema, comparando o que está no ar com
ESPECIFICACAO.md e com os protótipos. Não corrija nada ainda — só me
apresente o diagnóstico.

Organize em cinco blocos:

1. FIDELIDADE AO PROTÓTIPO
   Tela por tela (Painel, Estoque, Vendas, Caixa, Ficha), compare o que foi
   construído com patio-prototipo.html e patio-mobile.html. Liste diferenças
   de layout, espaçamento, cor, tipografia e texto de interface. Para cada
   uma, diga se foi decisão deliberada ou desvio acidental.

   Preste atenção especial em:
   - As três faixas de coluna da tabela de estoque (cinza, destaque, verde)
   - A regra de inversão para vermelho quando anúncio <= custo total
   - O bloco de patrimônio: cor identifica natureza, peso identifica certeza
   - Números em fonte monoespaçada com tabular-nums

2. CORREÇÃO DOS CÁLCULOS
   Rode a tabela de conferência da seção 9 da especificação e me mostre o
   resultado de cada linha. Depois verifique as fórmulas da seção 4 contra os
   exemplos numéricos: Honda City com 3,35% e 0,59% ao mês, e o cenário de
   troca do Tracker nos dois modos de ágio.

3. REGRAS DE NEGÓCIO
   Verifique se estão implementadas e funcionando:
   - Retorno só lançável em veículo vendido
   - Garantia de 90 dias com barra de progresso
   - Validação de saldo antes de saída de caixa
   - Edição de veículo atualizando os movimentos de caixa vinculados
   - Exclusão em cascata com confirmação que lista o que será apagado
   - Vínculo de troca desfeito nos dois sentidos ao excluir
   - Rateio de custo em múltiplos veículos
   - Atalhos de custo gerados do histórico

4. MOBILE
   Teste em viewport de 390px. Verifique alvos de toque de 44px, fonte de
   16px nos campos, inputmode correto, safe-area-inset, e se a navegação
   inferior e o botão flutuante estão onde deveriam.

5. RISCOS
   O que você mudaria antes de a loja depender disso no dia a dia. Inclua
   segurança, tratamento de erro, o que acontece se a API falhar no meio de
   um lançamento, e o que acontece se duas pessoas lançarem ao mesmo tempo.

Seja crítico e específico. Prefiro uma lista longa de problemas reais a um
relatório curto dizendo que está tudo certo.
```

---

## Prompt D — Higiene de código

Vale rodar pelo menos uma vez.

```
Faça uma varredura no repositório procurando:

1. Funções duplicadas — mesma função definida mais de uma vez no mesmo
   escopo. Em JavaScript a última declaração vence silenciosamente, e isso
   já aconteceu duas vezes durante a prototipagem.
2. Código morto — funções nunca chamadas, imports não usados, handlers
   apontando para funções inexistentes
3. Fórmulas duplicadas entre backend e frontend. A regra é que todo cálculo
   mora no backend; se houver cópia no cliente, aponte

Me mostre o que encontrar antes de remover qualquer coisa.
```

---

## Um lembrete de segurança

Credenciais de acesso não devem circular por chat, e-mail ou mensagem. Se essa senha for reaproveitada em outros serviços, troque em todos. Para um sistema com três sócios, vale considerar login por link mágico no e-mail — elimina a senha do fluxo inteiro e é simples de implementar.
