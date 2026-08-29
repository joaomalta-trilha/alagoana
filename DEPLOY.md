# Colocar no ar — Render

O [render.yaml](render.yaml) descreve o serviço e o banco. O Render lê esse
arquivo e cria os dois; você não precisa clicar em nada além de autorizar.

## 1. Enviar o código

O repositório local já está iniciado e commitado. Falta o remoto:

```bash
gh repo create alagoana --private --source=. --push
```

Sem o `gh` instalado, crie o repositório vazio pelo site e depois:

```bash
git remote add origin git@github.com:SEU-USUARIO/alagoana.git && git push -u origin main
```

## 2. Criar o serviço

No Render: **New › Blueprint**, aponte para o repositório. Ele lê o
`render.yaml`, cria o serviço `alagoana` e o banco `alagoana-db`, e liga o
`DATABASE_URL` de um no outro sozinho.

Confira os planos e a região antes de confirmar — os nomes mudam de tempos em
tempos, e o arquivo pode estar desatualizado em relação ao painel de hoje.

**Não use o plano gratuito de banco para dados de verdade.** Ele costuma ter
prazo de validade e some com o conteúdo junto.

## 3. Primeira carga

A migração roda sozinha a cada deploy (`preDeployCommand`), então o schema
sobe na primeira publicação. Faltam a carga inicial e a sua senha, e os dois
podem sair do seu Mac, apontando para o banco da nuvem — assim não dependem de
ter shell remoto no plano contratado.

Antes de qualquer coisa, **feche o banco para o mundo**. O Render cria o
Postgres aceitando conexão de qualquer endereço (`0.0.0.0/0`). Em *Access
Control*, troque isso pelo seu IP atual enquanto durar a carga, e **esvazie a
lista quando terminar** — o aplicativo fala com o banco pela rede interna e não
precisa de acesso externo nenhum para funcionar.

Pegue a **External Database URL** no painel do banco e acrescente
`?sslmode=verify-full` no fim. Depois, num terminal:

```bash
export DATABASE_URL='postgres://...render.com/alagoana?sslmode=verify-full'
```

Essa URL contém a senha do banco. Não cole em chat, e-mail ou bloco de notas;
se escapar, o caminho mais limpo é recriar o banco enquanto ele ainda só tem a
carga inicial, que é reproduzível.

```bash
npm run db:semear && npm run db:conferir
```

```bash
npm run senha -- joaofighera@gmail.com
```

Feche esse terminal quando terminar. A variável só vale nele, e o `.env` local
continua apontando para o Postgres da sua máquina.

## 4. Conferir

```bash
curl -s https://alagoana.onrender.com/api/saude
```

Deve responder `{"ok":true}` — é a mesma rota que o Render usa para decidir se
a versão nova entra no ar. Depois, abra o endereço no navegador e entre.

## 5. Atualizações

`git push` na `main` e o Render publica: instala, roda `npm run build` (que
inclui a checagem de tipos dos dois workspaces), aplica as migrações pendentes
e só então troca o processo. Migração que falha derruba o deploy e deixa a
versão anterior atendendo — que é o comportamento desejado.

## O que vigiar

**Uma instância só.** O freio de tentativas de login vive em memória. Com duas
instâncias, cada uma teria o seu, e o limite na prática dobraria. Para três
usuários isso não é gargalo; se um dia precisar escalar, o freio precisa sair
para o banco antes.

**Backup.** São duas camadas, e cada uma cobre um estrago diferente.

O Render faz backup diário do Postgres pago — o plano aqui é `basic-256mb`.
Confira a retenção no painel, em **alagoana-db › Backups**. Isso cobre o disco
morrer.

A cópia própria cobre o resto: conta encerrada, banco apagado, `--confirmo` no
comando errado. E sai do Render, ficando com a loja.

```bash
DATABASE_URL="$ALAGOANA_DB" npm run backup
```

Grava em `backups/`, que o git ignora — um dump tem todo o financeiro e os
hashes de senha, e commitá-lo seria publicá-lo. São ~60 KB; guarde fora do
computador.

Para voltar:

```bash
npm run restaurar -- backups/alagoana-....dump --confirmo
```

Contra banco que não seja `localhost` ele exige também `--producao`, e mostra
o endereço do destino e o que será apagado antes de perguntar.

**O ciclo foi testado**: em 29/08/2026 o banco local foi destruído com
`drop schema public cascade` e trazido de volta do dump; `npm run db:conferir`
respondeu TUDO CONFERE. Backup que nunca foi restaurado é uma suposição, não
um backup — este deixou de ser.

**As datas de negócio não dependem do fuso da máquina.** `FUSO_DO_NEGOCIO` em
[env.ts](apps/api/src/env.ts) é fixo em `America/Maceio`, de propósito: a
plataforma define `TZ=UTC`, e se "hoje" saísse dali, das 21h à meia-noite o
sistema acharia que já é o dia seguinte — e isso contaminaria dias em pátio,
garantia e a data sugerida no lançamento de custo.

**`CONFIAR_PROXY=1` é obrigatório no Render.** Sem isso, todos os pedidos
chegam com o IP do proxy e o freio de login trata a loja inteira como um
visitante só: cinco senhas erradas de qualquer pessoa trancam todo mundo por
quinze minutos.
