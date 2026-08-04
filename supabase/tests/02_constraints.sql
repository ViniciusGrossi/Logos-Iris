-- Logos Iris — pgTAP: constraints núcleo (FK, NOT NULL, unique, check) + cascade
-- Roda como role de conexão padrão do runner (postgres/superuser, BYPASSRLS) — não precisa de JWT.
-- Depende de supabase/seed.sql para as linhas de referência (tenant A, plano básico, contact A1).

-- ponytail: extensions.throws_ok(sql, code, desc) de 3 args despacha, quando octet_length(code)=5
-- (todo SQLSTATE tem 5 bytes), para throws_ok(sql, code, $3 AS MENSAGEM esperada, NULL AS desc) —
-- ou seja, o 3º argumento vira "mensagem exata esperada", não descrição do teste. Todos os
-- throws_ok abaixo usam a forma de 4 args (sql, code, null, description) pra comparar só o SQLSTATE.

begin;
select plan(10);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set plano_basico '''00000000-0000-0000-0000-000000000101'''
\set owner_a '''00000000-0000-0000-0000-0000000a0001'''
\set conversation_a1 '''00000000-0000-0000-0000-0000000d0001'''

-- 1. tenants.whatsapp_number: unique — duplicar o número do tenant A falha
select throws_ok(
  format($$insert into iris.tenants (nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
           values ('Duplicata', %L, 'evolution', '+5511987650001')$$, :plano_basico),
  '23505',
  null,
  'iris.tenants.whatsapp_number tem unique constraint'
);

-- 2. tenants.plano_id: FK — plano inexistente falha
select throws_ok(
  $$insert into iris.tenants (nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
    values ('Sem Plano', gen_random_uuid(), 'evolution', '+5511900000199')$$,
  '23503',
  null,
  'iris.tenants.plano_id tem FK contra iris.plans'
);

-- 3. tenants.whatsapp_provider: CHECK — provider fora do enum falha
select throws_ok(
  format($$insert into iris.tenants (nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
           values ('Provider Invalido', %L, 'whatsapp_web_invalido', '+5511900000299')$$, :plano_basico),
  '23514',
  null,
  'iris.tenants.whatsapp_provider tem CHECK de enum'
);

-- 4. contacts: unique(tenant_id, telefone_hash) — duplicar telefone do mesmo tenant falha
select throws_ok(
  format($$insert into iris.contacts (tenant_id, telefone_hash, telefone_enc)
           values (%L, iris_private.phone_hash('+5511911110001'), iris_private.encrypt_pii('+5511911110001'))$$, :tenant_a),
  '23505',
  null,
  'iris.contacts tem unique(tenant_id, telefone_hash)'
);

-- 5. contacts.tenant_id: NOT NULL
select throws_ok(
  $$insert into iris.contacts (tenant_id, telefone_hash, telefone_enc)
    values (null, iris_private.phone_hash('+5511900000399'), iris_private.encrypt_pii('+5511900000399'))$$,
  '23502',
  null,
  'iris.contacts.tenant_id é NOT NULL'
);

-- 6. tenant_members: unique(tenant_id, user_id) — vínculo duplicado falha
select throws_ok(
  format($$insert into iris.tenant_members (tenant_id, user_id, role) values (%L, %L, 'seat')$$, :tenant_a, :owner_a),
  '23505',
  null,
  'iris.tenant_members tem unique(tenant_id, user_id)'
);

-- 7. messages.direcao: CHECK — valor fora de ('recebida','enviada') falha
select throws_ok(
  format($$insert into iris.messages (tenant_id, conversation_id, conteudo_enc, direcao)
           values (%L, %L, iris_private.encrypt_pii('teste'), 'lateral')$$, :tenant_a, :conversation_a1),
  '23514',
  null,
  'iris.messages.direcao tem CHECK de enum'
);

-- 8. messages.conversation_id: FK — conversa inexistente falha
select throws_ok(
  format($$insert into iris.messages (tenant_id, conversation_id, conteudo_enc, direcao)
           values (%L, gen_random_uuid(), iris_private.encrypt_pii('teste'), 'recebida')$$, :tenant_a),
  '23503',
  null,
  'iris.messages.conversation_id tem FK contra iris.conversations'
);

-- 9. conversations.persona_ativa: CHECK — persona fora do enum falha
select throws_ok(
  format($$insert into iris.conversations (tenant_id, contact_id, persona_ativa)
           values (%L, '00000000-0000-0000-0000-0000000c0001', 'financeiro')$$, :tenant_a),
  '23514',
  null,
  'iris.conversations.persona_ativa tem CHECK de enum'
);

-- 10. cascade: apagar um tenant remove (ON DELETE CASCADE) seus contacts
-- Statements sequenciais (não uma única CTE): um DELETE dentro de WITH não fica visível para
-- leituras da tabela-base dentro da MESMA query (todas as sub-statements de um WITH compartilham
-- o snapshot do início da query) — precisa de commits de statement separados dentro da transação.
-- ponytail: \gset é meta-comando client-side do psql, não interpretado por execução via MCP execute_sql
-- (SQL puro enviado direto ao Postgres) — id fixo literal no INSERT substitui RETURNING ... \gset,
-- preservando a intenção do teste (cascade) sem depender de captura de variável de sessão.
insert into iris.tenants (id, nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
values ('00000000-0000-0000-0000-0000000ff001', 'Tenant Descartável', :plano_basico::uuid, 'evolution', '+5511900000499');

insert into iris.contacts (tenant_id, telefone_hash, telefone_enc)
values ('00000000-0000-0000-0000-0000000ff001', iris_private.phone_hash('+5511900000599'), iris_private.encrypt_pii('+5511900000599'));

delete from iris.tenants where id = '00000000-0000-0000-0000-0000000ff001';

select is(
  (select count(*)::int from iris.contacts where tenant_id = '00000000-0000-0000-0000-0000000ff001'),
  0,
  'ON DELETE CASCADE de tenants remove contacts associados'
);

select * from finish();
rollback;
