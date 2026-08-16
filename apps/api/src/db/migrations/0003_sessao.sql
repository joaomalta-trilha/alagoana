-- Sessão — §5
--
-- Login por e-mail e senha, cookie httpOnly, 30 dias com renovação por uso.
--
-- O que vai no cookie é um token aleatório de 32 bytes. O banco guarda só o
-- sha256 dele: quem lê um dump não consegue se passar por ninguém. Não é
-- argon2 aqui de propósito — argon2 protege segredo que humano escolhe e que
-- portanto é adivinhável. Um token de 256 bits não é adivinhável, e o custo
-- do argon2 seria pago em toda requisição autenticada, não só no login.

create table sessao (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references usuario(id) on delete cascade,
  token_hash     bytea not null unique,                 -- sha256 do token do cookie
  criado_em      timestamptz not null default now(),
  ultimo_uso_em  timestamptz not null default now(),
  expira_em      timestamptz not null,
  ip             text,
  user_agent     text
);

create index sessao_usuario_idx on sessao (usuario_id);
create index sessao_expira_idx  on sessao (expira_em);

comment on column sessao.expira_em is
  'Renovada a cada uso (§5), no máximo uma escrita por dia por sessão.';

comment on table sessao is
  'Sessão fica em tabela, não em JWT assinado, para que "sair" e "revogar" '
  'signifiquem alguma coisa: um DELETE aqui derruba o acesso na hora.';
