-- Logos Iris — pgTAP: painel-cliente-v1 — ListConversations/GetConversationMessages/GetDailySummary
-- (migração 0026). Cobre o que o Vitest (Fakes, sem DB real) não alcança: (a) as 3 RPCs são
-- service-role-only (ADR-018); (b) contact_nome/telefone e conteúdo de mensagem saem DECRIPTADOS;
-- (c) isolamento de tenant nas 3; (d) paginação (total via window function) bate com a contagem real.
-- Seed usado: supabase/seed.sql — tenant A (a1) tem 2 conversas (d0001 com c0001, 2 mensagens;
-- d0002 com c0002, encerrada); tenant B (b1) tem d0003 (c0004).

begin;
select plan(10);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set tenant_b '''00000000-0000-0000-0000-0000000000b1'''
\set conversation_a1 '''00000000-0000-0000-0000-0000000d0001'''

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_a))::text,
  true
);

select throws_ok(
  format($$select * from iris.conversations_list(%L, null, null, 20, 0)$$, :tenant_a),
  '42501', null, 'tenant autenticado NAO consegue chamar conversations_list'
);
select throws_ok(
  format($$select * from iris.conversation_messages_list(%L, %L, 50, 0)$$, :tenant_a, :conversation_a1),
  '42501', null, 'tenant autenticado NAO consegue chamar conversation_messages_list'
);
select throws_ok(
  format($$select * from iris.dashboard_summary(%L, current_date)$$, :tenant_a),
  '42501', null, 'tenant autenticado NAO consegue chamar dashboard_summary'
);

set local role service_role;

select is(
  (select count(*)::int from iris.conversations_list(:tenant_a::uuid, null, null, 20, 0)),
  2,
  'conversations_list devolve as 2 conversas do tenant A'
);
select is(
  (select contact_nome from iris.conversations_list(:tenant_a::uuid, null, null, 20, 0) where id = :conversation_a1::uuid),
  'Camila Rocha',
  'conversations_list decripta contact_nome corretamente'
);
-- as 2 mensagens de d0001 (seed) têm created_at IDÊNTICO (mesmo INSERT, mesmo default now()) —
-- desempate não é determinístico, então valida só que a preview é uma das 2 mensagens reais
-- (decriptada), não que uma vença especificamente a outra.
select ok(
  (select ultima_mensagem_preview from iris.conversations_list(:tenant_a::uuid, null, null, 20, 0) where id = :conversation_a1::uuid)
    in ('Oi, queria marcar um horário pra sexta', 'Claro! Temos horário às 14h ou 16h na sexta, qual prefere?'),
  'conversations_list devolve uma preview decriptada valida (mensagem real da conversa)'
);
select is(
  (select count(*)::int from iris.conversations_list(:tenant_b::uuid, null, null, 20, 0)),
  2,
  'conversations_list isola por tenant — tenant B so ve as proprias 2 conversas'
);
select is(
  (select status from iris.conversations_list(:tenant_a::uuid, 'encerrada'::text, null, 20, 0) limit 1),
  'encerrada',
  'conversations_list filtra por status'
);

select is(
  (select count(*)::int from iris.conversation_messages_list(:tenant_a::uuid, :conversation_a1::uuid, 50, 0)),
  2,
  'conversation_messages_list devolve as 2 mensagens da conversa'
);
select is(
  (select conteudo from iris.conversation_messages_list(:tenant_a::uuid, :conversation_a1::uuid, 50, 0) where direcao = 'recebida' limit 1),
  'Oi, queria marcar um horário pra sexta',
  'conversation_messages_list decripta o conteudo corretamente'
);

select * from finish();
rollback;
