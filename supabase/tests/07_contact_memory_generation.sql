-- Logos Iris — pgTAP: contact-memory — geração de resumo + purge de retenção + cascata de
-- esquecimento (docs/specs/contact-memory.md, migração 0022). Cobre o que src/tests/
-- contact-memory.test.ts (Fakes sem DB real) não alcança: (a) as RPCs são service-role-only
-- (mesmo padrão ADR-018 de 0015/0016/0020); (b) expira_em REALMENTE deriva de
-- plans.retencao_memoria_dias do tenant certo (90d tenant A / 180d tenant B); (c) purge diário
-- hard-deleta resumo vencido + knowledge_chunks órfão; (d) trigger de cascata hard-deleta ao
-- setar contacts.deleted_at; (e) fila pgmq contact_memory_summarize round-trips corretamente.
-- Seed usado: supabase/seed.sql — c0001 (tenant A) tem 2 mensagens seedadas na conversa d0001 e
-- um resumo JÁ EXPIRADO (reusado aqui como fixture pronta pro teste de purge); c0002 (tenant A) e
-- c0004 (tenant B) têm resumo válido; c0003 (tenant B) tem 1 mensagem seedada, sem resumo.
--
-- ponytail: \gset é meta-comando client-side do psql, não interpretado por execução via MCP
-- execute_sql (SQL puro enviado direto ao Postgres) — id fixo literal no INSERT + set_config()
-- (função SQL real, não meta-comando) substituem RETURNING ... \gset (mesmo padrão de
-- 02_constraints.sql/03_soft_delete.sql).

begin;
select plan(21);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set tenant_b '''00000000-0000-0000-0000-0000000000b1'''
\set contact_a_c0001 '''00000000-0000-0000-0000-0000000c0001'''
\set contact_a_c0002 '''00000000-0000-0000-0000-0000000c0002'''
\set contact_b_c0003 '''00000000-0000-0000-0000-0000000c0003'''
\set contact_b_c0004 '''00000000-0000-0000-0000-0000000c0004'''

-- ══════════════════════════════════════════════════════════════════════════
-- authenticated: todas as RPCs novas são service-role-only (ADR-018) — nem o próprio tenant
-- pode chamar direto (mesmo padrão do throws_ok em 06_).
-- ══════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_a))::text,
  true
);

select throws_ok(
  format($$select * from iris.memory_fetch_messages_for_period(%L, %L, now() - interval '1 day', now())$$, :tenant_a, :contact_a_c0001),
  '42501',
  null,
  'tenant A autenticado NÃO consegue chamar iris.memory_fetch_messages_for_period (service-role-only)'
);

select throws_ok(
  format($$select * from iris.memory_create_summary(%L, %L, 'texto', now() - interval '1 day', now())$$, :tenant_a, :contact_a_c0001),
  '42501',
  null,
  'tenant A autenticado NÃO consegue chamar iris.memory_create_summary (service-role-only)'
);

select throws_ok(
  $$select iris.memory_consume_summarize_queue(10)$$,
  '42501',
  null,
  'tenant A autenticado NÃO consegue chamar iris.memory_consume_summarize_queue (service-role-only)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- service_role: caminho real do worker (ADR-018/031)
-- ══════════════════════════════════════════════════════════════════════════
set local role service_role;

-- ── Requisito 1/6: memory_fetch_messages_for_period ──
select is(
  (select count(*)::int from iris.memory_fetch_messages_for_period(:tenant_a::uuid, :contact_a_c0001::uuid, now() - interval '1 day', now() + interval '1 day')),
  2,
  'memory_fetch_messages_for_period devolve as 2 mensagens seedadas do contato c0001 (tenant A)'
);

select is(
  (select conteudo from iris.memory_fetch_messages_for_period(:tenant_a::uuid, :contact_a_c0001::uuid, now() - interval '1 day', now() + interval '1 day') where direcao = 'recebida' limit 1),
  'Oi, queria marcar um horário pra sexta',
  'memory_fetch_messages_for_period devolve o conteúdo DECRIPTADO da mensagem recebida'
);

select is(
  (select count(*)::int from iris.memory_fetch_messages_for_period(:tenant_a::uuid, :contact_b_c0003::uuid, now() - interval '1 day', now() + interval '1 day')),
  0,
  'memory_fetch_messages_for_period NÃO cruza tenant — contact_id de B consultado com tenant_id de A devolve 0 linhas'
);

-- ── Requisito 1/2: memory_create_summary — expira_em deriva do plano do TENANT CERTO ──
select ok(
  (
    select abs(extract(epoch from (expira_em - (now() + interval '90 days')))) < 5
    from iris.memory_create_summary(:tenant_a::uuid, :contact_a_c0001::uuid, 'resumo pgTAP — tenant A (plano Básico, 90d)', now() - interval '1 day', now())
  ),
  'memory_create_summary: tenant A (plano Básico) → expira_em = created_at + 90 dias (retencao_memoria_dias do seed)'
);

select ok(
  (
    select abs(extract(epoch from (expira_em - (now() + interval '180 days')))) < 5
    from iris.memory_create_summary(:tenant_b::uuid, :contact_b_c0004::uuid, 'resumo pgTAP — tenant B (plano Premium, 180d)', now() - interval '1 day', now())
  ),
  'memory_create_summary: tenant B (plano Premium) → expira_em = created_at + 180 dias — prova que NÃO é hardcoded, deriva do plano de cada tenant'
);

select is(
  (
    select iris_private.decrypt_pii(cms.resumo_enc)
    from iris.contact_memory_summaries cms
    where cms.contact_id = :contact_a_c0001::uuid
    order by cms.created_at desc
    limit 1
  ),
  'resumo pgTAP — tenant A (plano Básico, 90d)',
  'memory_create_summary grava resumo_enc CIFRADO — decripta de volta pro texto exato passado (nunca o texto puro em outra coluna)'
);

select throws_ok(
  $$select * from iris.memory_create_summary('00000000-0000-0000-0000-00000000dead'::uuid, '00000000-0000-0000-0000-00000000dead'::uuid, 'x', now() - interval '1 day', now())$$,
  'P0002',
  null,
  'memory_create_summary lança exceção explícita (nunca insert silencioso) pra tenant sem plano associado'
);

-- ══════════════════════════════════════════════════════════════════════════
-- Requisito 3: purge diário (100% SQL, sem contraparte em TS — mesmo padrão de 0013)
-- ══════════════════════════════════════════════════════════════════════════
-- fixture: resumo JÁ EXPIRADO do seed (c0001, ver supabase/seed.sql) + um knowledge_chunk órfão
-- apontando pra ele via source_id — prova a higiene extra (comentário da migração 0022 §3).
select set_config(
  'pgtap.expired_summary_id',
  (select id::text from iris.contact_memory_summaries where contact_id = :contact_a_c0001::uuid and expira_em < now() limit 1),
  true
);

select isnt(current_setting('pgtap.expired_summary_id', true), null, 'fixture: seed tem um contact_memory_summaries expirado pra c0001 (pré-condição do teste de purge)');

insert into iris.knowledge_chunks (tenant_id, source_type, source_id, contact_id, content_enc, embedding)
values (
  :tenant_a::uuid, 'contact_memory', current_setting('pgtap.expired_summary_id')::uuid, :contact_a_c0001::uuid,
  iris_private.encrypt_pii('chunk órfão de resumo vencido'), ('[' || array_to_string(array_fill(0, array[1536]), ',') || ']')::public.vector
);

select ok(
  iris_private.purge_expired_contact_memory() > 0,
  'purge_expired_contact_memory() reporta pelo menos 1 linha purgada (o resumo expirado do seed)'
);

select is(
  (select count(*)::int from iris.contact_memory_summaries where id = current_setting('pgtap.expired_summary_id')::uuid),
  0,
  'purge_expired_contact_memory() hard-deleta o contact_memory_summaries com expira_em vencido'
);

select is(
  (select count(*)::int from iris.knowledge_chunks where source_type = 'contact_memory' and source_id = current_setting('pgtap.expired_summary_id')::uuid),
  0,
  'purge_expired_contact_memory() hard-deleta também o knowledge_chunks órfão (source_id do resumo purgado)'
);

select is(
  (select count(*)::int from iris.contact_memory_summaries where contact_id = :contact_a_c0002::uuid and expira_em > now()),
  1,
  'purge_expired_contact_memory() NÃO toca no resumo AINDA VÁLIDO de c0002 (não é um DELETE geral)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- Requisito 5: cascata de esquecimento (contacts.deleted_at → hard-delete)
-- id fixo literal em vez de RETURNING ... \gset (ver nota de topo do arquivo).
-- ══════════════════════════════════════════════════════════════════════════
insert into iris.contacts (id, tenant_id, telefone_hash, telefone_enc)
values ('00000000-0000-0000-0000-0000000cf0f0', :tenant_a::uuid, iris_private.phone_hash('+5511900000099'), iris_private.encrypt_pii('+5511900000099'));

insert into iris.contact_memory_summaries (id, contact_id, tenant_id, resumo_enc, periodo_inicio, periodo_fim, expira_em)
values (
  '00000000-0000-0000-0000-0000000cf0f1', '00000000-0000-0000-0000-0000000cf0f0', :tenant_a::uuid,
  iris_private.encrypt_pii('resumo do contato que vai ser esquecido'), now() - interval '1 day', now(), now() + interval '89 days'
);

insert into iris.knowledge_chunks (tenant_id, source_type, source_id, contact_id, content_enc, embedding)
values (
  :tenant_a::uuid, 'contact_memory', '00000000-0000-0000-0000-0000000cf0f1', '00000000-0000-0000-0000-0000000cf0f0',
  iris_private.encrypt_pii('chunk do contato esquecido'), ('[' || array_to_string(array_fill(0, array[1536]), ',') || ']')::public.vector
);

update iris.contacts set deleted_at = now() where id = '00000000-0000-0000-0000-0000000cf0f0';

select is(
  (select count(*)::int from iris.contact_memory_summaries where contact_id = '00000000-0000-0000-0000-0000000cf0f0'),
  0,
  'contacts_cascade_forget_trigger hard-deleta contact_memory_summaries ao setar contacts.deleted_at'
);

select is(
  (select count(*)::int from iris.knowledge_chunks where contact_id = '00000000-0000-0000-0000-0000000cf0f0' and source_type = 'contact_memory'),
  0,
  'contacts_cascade_forget_trigger hard-deleta knowledge_chunks(source_type=contact_memory) do contato esquecido'
);

select is(
  (select count(*)::int from iris.contact_memory_summaries where contact_id = :contact_b_c0004::uuid),
  1,
  'contacts_cascade_forget_trigger NÃO afeta contact_memory_summaries de OUTRO contato (c0004, tenant B intacto)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- Fila pgmq contact_memory_summarize: round-trip via os wrappers service-role-only
-- ══════════════════════════════════════════════════════════════════════════
select set_config(
  'pgtap.test_msg_id',
  (select pgmq.send('contact_memory_summarize', jsonb_build_object('tenant_id', :tenant_a, 'contact_id', :contact_a_c0001, 'periodo_inicio', now() - interval '1 day', 'periodo_fim', now()))::text),
  true
);

select ok(
  jsonb_array_length(iris.memory_consume_summarize_queue(50)) >= 1,
  'memory_consume_summarize_queue devolve pelo menos a mensagem de teste recém-enfileirada'
);

select ok(
  iris.memory_delete_summarize_queue_item(current_setting('pgtap.test_msg_id')::bigint),
  'memory_delete_summarize_queue_item remove a mensagem de teste da fila com sucesso'
);

-- ══════════════════════════════════════════════════════════════════════════
-- Requisito 1 (orquestração) — enqueue diário encontra contato(s) com mensagem nova a resumir
-- ══════════════════════════════════════════════════════════════════════════
select ok(
  iris_private.enqueue_contact_memory_summarization() >= 1,
  'enqueue_contact_memory_summarization() enfileira pelo menos 1 contato com mensagem nova (c0001/c0003 do seed)'
);

select * from finish();
rollback;
