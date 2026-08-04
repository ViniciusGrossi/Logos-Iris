-- Logos Iris — pgTAP: service_role tem grant de tabela em iris (0014 — achado crítico @revisor-codigo)
-- BYPASSRLS não é GRANT: sem isso o webhook/engine (que rodam como service_role) quebrariam em
-- runtime mesmo com RLS "corretamente" configurado. Roda como service_role puro, sem JWT/policy —
-- é exatamente o caminho que webhook_inbox e messages usam em produção (ADR-018, ADR-028).
-- Sem este teste o gap de grant passaria despercebido de novo: 01-03 rodam como postgres (dono das
-- tabelas, acesso implícito), nunca exercitando o path real de service_role.

begin;
select plan(4);

-- IDs fixos do seed.sql
\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set conversation_a1 '''00000000-0000-0000-0000-0000000d0001'''

set local role service_role;

-- 1. messages INSERT: service_role consegue gravar (grant da 0014 — messages não tem policy pra service_role)
select lives_ok(
  format($$insert into iris.messages (tenant_id, conversation_id, conteudo_enc, direcao, provider_message_id)
           values (%L, %L, '\x0009'::bytea, 'recebida', 'test-svc-role-04')$$, :tenant_a, :conversation_a1),
  'service_role consegue INSERT em iris.messages (grant da 0014, não dependia de RLS)'
);

-- 2. messages SELECT: service_role consegue ler de volta
select is(
  (select count(*)::int from iris.messages where provider_message_id = 'test-svc-role-04'),
  1,
  'service_role consegue SELECT em iris.messages (grant da 0014)'
);

-- 3. webhook_inbox INSERT: ADR-018 service-role-only, RLS ON sem nenhuma policy — só grant abre acesso
select lives_ok(
  format($$insert into iris.webhook_inbox (tenant_id, provider_message_id) values (%L, 'test-svc-role-04')$$, :tenant_a),
  'service_role consegue INSERT em iris.webhook_inbox (grant da 0014 — ADR-018 depende só disso, zero policy)'
);

-- 4. webhook_inbox SELECT: idem
select is(
  (select count(*)::int from iris.webhook_inbox where provider_message_id = 'test-svc-role-04'),
  1,
  'service_role consegue SELECT em iris.webhook_inbox (grant da 0014)'
);

select * from finish();
rollback;
