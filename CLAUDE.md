# Alagoana Veículos

Sistema de gestão de uma loja de seminovos em Maceió. Substitui uma planilha
com uma aba por veículo. Três sócios, sem funcionários no sistema. Está no ar
em <https://alagoana.onrender.com>.

**Volume esperado: ~20 veículos ativos, ~30 lançamentos por semana, 3 usuários.
Não otimize para escala.**

## A fonte de verdade

[referencia/ESPECIFICACAO.md](referencia/ESPECIFICACAO.md) manda. Quando código
e especificação divergem, a especificação ganha até alguém decidir o contrário
por escrito. As seções são citadas nos comentários como §4.5, §6.3 e assim por
diante — procure por elas quando quiser entender por que algo é como é.

[referencia/patio-prototipo.html](referencia/patio-prototipo.html) e
[patio-mobile.html](referencia/patio-mobile.html) são a referência visual e
comportamental. Abrem no navegador com dois cliques, sem servidor nem banco.
Em dúvida sobre layout, espaçamento ou texto de interface, consulte antes de
improvisar.

## Cinco regras que não se quebram

**Dinheiro é centavo inteiro, do banco à tela.** `numeric(12,2)` no Postgres,
que o driver devolve como string e o domínio converte em inteiro na borda
(`dominio/dinheiro.ts`). Nenhum ponto flutuante toca valor monetário em lugar
nenhum — a API troca centavos, e a formatação monta a string a partir do
inteiro, sem dividir por 100.

**Toda fórmula mora no backend.** As contas da §4 existem em um lugar só:
`apps/api/src/dominio/`. O frontend recebe número pronto. Já houve varredura
para tirar aritmética de dinheiro da tela; se você se pegar somando no React,
o número certo provavelmente já vem da API — e se não vem, o lugar de somar é
lá, não aqui.

**As mensagens da §8 são literais.** Vivem em `dominio/mensagens.ts` e os
testes as comparam contra o texto do documento. Nenhuma tela reescreve
mensagem de validação.

**Data de negócio é `date` puro, e o fuso não sai do ambiente.**
`FUSO_DO_NEGOCIO` em `env.ts` é fixo em `America/Maceio` de propósito: a
plataforma define `TZ=UTC`, e se "hoje" saísse dali, das 21h à meia-noite o
sistema acharia que já é amanhã.

**Saldo nunca é armazenado.** É sempre `saldo_inicial + soma dos movimentos`,
pela view `saldo_conta`. Se aparecer uma coluna de saldo, ela vai divergir.

## O que a loja mudou depois da especificação

A especificação manda, mas ela pode ser alterada por escrito — e foi, três
vezes em 17/08/2026:

- **Comissão virou uma linha só**, Alagoana R$ 1.500, no lugar de Alagoana
  R$ 1.000 + Victor R$ 500. Mesmo total. A §4.6 foi atualizada com a data.
- **Transferência entre contas** do caixa: duas linhas unidas por
  `transferencia_id`, e nada de `aporte_socio` — o dinheiro mudou de bolso,
  não entrou na empresa.
- **Desfazer venda**, que devolve o carro ao pátio apagando só o que a venda
  criou. Recusa quando entrou carro na troca ou quando o dinheiro já foi
  gasto; as duas recusas têm teste.
- **Mais de um veículo na troca.** A §4.5 falava de um; agora entra quantos
  forem, cada um com a sua avaliação, o seu modo e o seu ágio. O caixa recebe
  a venda menos a soma das avaliações.
- **A comissão sai do caixa junto com a venda**, da mesma conta que recebeu:
  vender por 40.000 com 1.500 de comissão deixa 38.500. Sem conta escolhida
  na venda, ela volta a ser a provisão da §3.4.
- **O rastro da troca** na ficha do carro vendido: o que entrou, o que
  aconteceu com ele e quanto deu. Consulta recursiva, com guarda de ciclo e
  limite de profundidade. Fica **fora** das contas do veículo de propósito.

## Estrutura

```
apps/api/src/dominio/     funções puras: as fórmulas da §4, dinheiro, senha,
                          sessão, categorias, filtros, tipo de veículo
apps/api/src/servicos/    o que fala com o banco: veículo, custo, caixa,
                          catálogos, consultas
apps/api/src/http/        roteador, sessão, entrega do build
apps/api/src/db/          migrações (.sql, imutáveis), seed, CLIs
apps/web/src/             React: telas/, folhas/ (bottom sheets), componentes/
referencia/               especificação e protótipos
```

O mobile e o desktop são o mesmo app: media query em `estilos-desktop.css` e o
hook `useDesktop()` onde a estrutura muda de verdade (cartão vira tabela).

## Rodar

```bash
npm run dev        # API em :3000 e Vite em :5173, juntos
npm run teste      # 191 testes; cria e derruba um banco descartável
npm run tipos      # tsc nos dois workspaces
npm run build      # checa tipos e constrói a interface
```

`npm run db:conferir` recalcula a carga inteira a partir do banco e sai com
erro se algum número divergir. **É a ferramenta de conferência do projeto** —
rode depois de qualquer mexida em cálculo, carga ou migração.

Usuários e senhas: `npm run usuario` e `npm run senha -- <e-mail>`.

## De onde vem a carga

`referencia/planilha-2026.xlsx` é a planilha que a loja mantém, e é a fonte da
verdade enquanto o sistema não entra em uso de verdade. `npm run carga:frota`
relê a planilha e regrava `frota.json`, conferindo os 21 totais por categoria
contra os totais que a própria planilha declara.

A versão de 16/08/2026 trouxe 20 veículos e 239 lançamentos — quatro a mais
que a §9, entre eles a venda do Tracker, um repasse (Ford Ka comprado e
passado adiante pelo mesmo valor no dia seguinte) e a primeira moto. A tabela
da §9 na especificação descreve o retrato **anterior**; a linha de base de
hoje é o topo de `conferir.ts`.

Duas coisas na própria planilha estão erradas e ficaram como estão, porque
corrigi-las seria inventar dado: a linha de rodapé do Tracker tem fórmula
quebrada (mostra venda negativa), e o `TOTAL` do rodapé declara 219.522,01
enquanto suas categorias somam 96.536,53. As transações, que é o que importa,
batem à vírgula.

Para trocar a frota de um banco que já está no ar: `npm run db:recarregar`
(ensaio) e `-- --confirmo` (grava). Preserva usuários, senhas e sessões, e
recusa se a loja já tiver usado o caixa — a partir daí a planilha deixou de
ser a fonte da verdade.

## Publicar

`git push` na `main`. O Render instala, checa tipos, constrói, roda
`db:migrar` e só então troca o processo. Migração que falha derruba o deploy e
mantém a versão anterior no ar. Detalhes em [DEPLOY.md](DEPLOY.md).

Mexer no banco da nuvem a partir do Mac exige abrir o IP em
**alagoana-db › Access Control** e fechar depois. O dia a dia da loja não passa
por ali.

## Como se verifica trabalho aqui

Teste automatizado para regra e cálculo; navegador para layout. Os exemplos
numéricos da especificação são casos de teste nomeados: o Tracker com troca
dando 17.816,54 pela avaliação e 13.816,54 pelo mercado, com 45.000 no caixa
nos dois. Os números do Honda City mudaram com a planilha de 16/08 (uma multa
de 131,46 depois da venda): hoje fecha em 93.984,66 / 3.015,34 / 3,21% / 170
dias, e é assim que `conferir.ts` o cobra. A fórmula é a mesma; o dado é que
andou.

Quando mexer em algo visual, meça no navegador em vez de olhar: estilo
computado, largura de texto contra largura da coluna, altura de alvo de toque.
Foi assim que apareceram a quebra de linha nos cartões e os seis alvos abaixo
de 44px.

## Estado

Os cinco itens de construção da §10 estão feitos. Falta o item 6, que não é
código: rodar um mês em paralelo com a planilha e investigar divergência de
total como bug.

Em aberto, por ordem de importância:

- Duas pessoas editando o mesmo veículo: a última ganha em silêncio. Há
  `for update`, então não corrompe, mas falta carimbo de versão.
- Backup do banco nunca foi restaurado. O Render faz; testar é outra coisa.
- O freio de tentativas existe só no login, e vive em memória — o que obriga a
  manter **uma instância só** no Render.

## Convenções de escrita

Código, comentários, commits e interface em português. Os comentários explicam
**por que**, não o quê — em especial quando a escolha foi contraintuitiva ou
custou um defeito. Os que citam um número medido ou um erro real valem mais
que os que descrevem a linha seguinte.
