# Como rodar

Ambiente já instalado nesta máquina:

- **Node 24.19.0 LTS** em `~/.local/node` (checksum conferido). Para desinstalar, apague a pasta.
- **Postgres.app 18.4** em `/Applications`, banco `alagoana` criado.
- Ambos já estão no `PATH` pelo `~/.zshrc`.

```bash
npm install          # uma vez
npm run db:migrar    # cria o schema e as categorias de custo da §3.7
npm run db:semear    # carrega catálogos, sócios, contas, 20 veículos e 239 lançamentos
npm run db:conferir  # confere a carga contra os números da planilha e os catálogos
npm run teste        # 191 testes com os exemplos numéricos da especificação
npm run db:zerar     # derruba tudo (só local) — depois migrar e semear de novo
```

## De onde vem a carga

A frota sai de `referencia/planilha-2026.xlsx` — a planilha que a loja mantém,
e que é a fonte da verdade até o sistema entrar em uso. `npm run carga:frota`
relê a planilha, regrava `frota.json` e reroda a conferência em Python, sem
depender de banco nenhum: confere os 21 totais por categoria contra os totais
que a própria planilha declara no rodapé.

`npm run carga:catalogo` regrava `catalogo.json` (marcas, modelos e cores) a
partir do protótipo. Ele sabe reconstruir a frota antiga de 16 veículos, mas
não faz isso sem `--frota-do-prototipo` — do contrário uma rodada distraída
devolveria o banco ao retrato de antes da planilha.

## Quando a planilha muda

`db:semear` só serve para banco vazio: se já houver veículos, ele recusa. Para
trocar a frota de um banco que já está no ar — o de produção, por exemplo —:

```bash
npm run carga:frota                    # relê a planilha
npm run db:recarregar                  # mostra o que mudaria, não grava
npm run db:recarregar -- --confirmo    # grava
```

A recarga troca veículos, custos, saldos das contas e capital de implantação.
Não toca em usuários, senhas nem sessões: ninguém é deslogado.

E ela **se recusa** a rodar se já houver movimento de caixa ou aporte lançado
pela loja. A partir daí a planilha deixou de ser a fonte da verdade, e
recarregar apagaria trabalho de verdade — nesse caso as mudanças entram pela
tela, uma a uma. Não há como forçar.

## Entrar no sistema

O seed cria os três sócios **sem senha**, de propósito: senha padrão em
repositório é senha vazada. Defina a sua uma vez, no terminal — ela é digitada
sem eco e não passa pelo histórico do shell:

```bash
npm run senha -- joaofighera@gmail.com
```

Sem argumento, o comando lista quem existe.

## Quem pode entrar

Só entra quem está **ativo** e **tem senha** — são duas coisas separadas, e um
usuário recém-criado não tem nenhuma das duas resolvidas por acidente.

```bash
npm run usuario
```

Lista todos, com o estado de cada um. Os outros comandos:

```bash
npm run usuario -- criar "Marina Costa" marina@alagoana.com.br
```

```bash
npm run usuario -- email victor@alagoana.local victor@alagoana.com.br
```

```bash
npm run usuario -- ativar victor@alagoana.com.br
```

Criar não define senha: isso continua sendo o `npm run senha`. E `desativar`
se recusa a derrubar o último acesso ativo com senha — sem essa trava, um
comando distraído trancaria todo mundo para fora do próprio sistema.

Victor e Ricardo já existem desde a carga inicial, inativos e com e-mail de
espaço reservado, porque a especificação previa três sócios mas só um e-mail
era conhecido.

## Rodar o app

Para trabalhar no código, um comando só sobe a API e o Vite juntos e abre em
<http://localhost:5173>:

```bash
npm run dev
```

Para rodar como em produção — a API entregando a interface já construída, tudo
em <http://localhost:3000>:

```bash
npm run build && npm run servir
```

O `build` gera `apps/web/dist`, que não vai para o repositório. Sem ele o
servidor sobe e avisa que a interface não foi construída.

O app é o mesmo nas duas larguras, como a §6.2 pede. Abaixo de 900px é o
mobile: navegação inferior de quatro ícones, cartões e o flutuante "+ Custo".
Acima, é o desktop: barra superior com as abas e "Lançar custo", barra de
filtros (Período, Marca, Faixa de preço), tabelas com as faixas de leitura e
os seis gráficos do painel. Os filtros valem em todas as telas ao mesmo tempo.

É instalável — no iPhone, Compartilhar › Adicionar à Tela de Início. Os ícones
são gerados por `npm run icones`, sem dependência de imagem.

Atrás do login está a API da etapa 3 da §10, com as fórmulas da §4 calculadas
no backend: veículo, custo, venda, troca, caixa e aporte. As rotas, os formatos
e as regras que valem em cada uma estão em [API.md](API.md).

Sobre a sessão: cookie `HttpOnly`, `SameSite=Lax`, 30 dias, renovada por uso.
O banco guarda só o sha256 do token — quem lê um dump não se passa por
ninguém. Em produção, ligue `COOKIE_SEGURO=1` no `.env`; em `http://localhost`
o cookie `Secure` não seria enviado pelo navegador e o login pareceria quebrado.

## Atenção ao nome da pasta

Não use barra (`/`) no nome da pasta no Finder: o macOS grava a barra no disco
como `:`, que é o separador do `PATH`, e aí todo `npm run` falha. A pasta já foi
renomeada para `Gestão de Estoque - Financeiro`, com hífen, e por isso funciona.

Se algum dia o `npm run` voltar a falhar por causa disso, dá para rodar chamando
o node direto:

```bash
node ./node_modules/tsx/dist/cli.mjs apps/api/src/db/seed/conferir.ts
```
