-- Logos Iris — pgTAP: tenant-router-queue (módulo 2) — advisory lock, idempotência de
-- find-or-create e isolamento RLS de conversation_state. Prova a nível de banco os Requisitos
-- 2 e 3 (lock por conversa) que o Vitest não alcança (fake em memória não tem pg_locks nem
-- 2 sessões Postgres) — é o alvo do it.todo() em src/tests/tenant-router-queue.test.ts.
--
-- Roda como postgres (dono da migration): router_route_inbound_message é SECURITY DEFINER,
-- executa como definer e alcança iris_private.* + pgmq. A parte de RLS troca pra authenticated.

begin;
select plan(9);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set tenant_b '''00000000-0000-0000-0000-0000000000b1'''
\set owner_b  '''00000000-0000-0000-0000-0000000b0001'''

-- ── 1ª mensagem de um contato NOVO do tenant A (exercita find-or-create) ──
select iris.router_route_inbound_message(
  :tenant_a,
  jsonb_build_object(
    'provider', 'evolution', 'tenant_whatsapp_number', '+5511987650001',
    'from', '+5511911119999', 'message_id', 'pgtap-router-1',
    'content', 'oi, primeira', 'media_type', 'texto', 'from_me', false,
    'timestamp', '2026-07-12T10:00:00.000Z'
  )
) as conv1 \gset

-- 1. conversa resolvida/criada (não-nula)
select isnt(:'conv1', null, 'router_route_inbound_message cria/resolve conversa p/ contato novo (não-nulo)');

-- 2. persona default da conversa NOVA = primeira personas_ativas do tenant A ('atendimento')
select is(
  (select persona_ativa from iris.conversations where id = :'conv1'::uuid),
  'atendimento',
  'conversa nova nasce com persona = personas_ativas[1] do tenant (atendimento) — DESVIO 2 documentado'
);

-- 3. Requisito 3 — pg_advisory_xact_lock foi adquirido nesta transação (exatamente 1 chave)
select is(
  (select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()),
  1,
  'advisory xact lock adquirido no roteamento (Requisito 3) — 1 chave por conversa'
);

-- ── 2ª mensagem do MESMO contato (mesma conversa, mesma chave de lock) ──
select iris.router_route_inbound_message(
  :tenant_a,
  jsonb_build_object(
    'provider', 'evolution', 'tenant_whatsapp_number', '+5511987650001',
    'from', '+5511911119999', 'message_id', 'pgtap-router-2',
    'content', 'oi, segunda', 'media_type', 'texto', 'from_me', false,
    'timestamp', '2026-07-12T10:00:05.000Z'
  )
) as conv2 \gset

-- 4. find-or-create idempotente: 2ª msg do mesmo contato cai na MESMA conversa
select is(:'conv2', :'conv1', 'mensagens do mesmo contato roteiam p/ a mesma conversa (não duplica)');

-- 5. exatamente 1 conversa ativa p/ o contato (lock serializou, sem corrida criando 2)
select is(
  (select count(*)::int from iris.conversations c
     join iris.contacts ct on ct.id = c.contact_id
    where ct.tenant_id = :tenant_a
      and ct.telefone_hash = iris_private.phone_hash('+5511911119999')
      and c.status = 'ativa'),
  1,
  'contato tem exatamente 1 conversa ativa após 2 mensagens (Requisito 2 — sem duplicação)'
);

-- 6. ambas as mensagens recebidas foram persistidas (buffer da engine)
select is(
  (select count(*)::int from iris.messages where conversation_id = :'conv1'::uuid and direcao = 'recebida'),
  2,
  'as 2 mensagens recebidas foram persistidas na conversa'
);

-- 7. debounce agendado no conversation_state (engine acorda após a janela)
select isnt(
  (select debounce_until from iris.conversation_state where conversation_id = :'conv1'::uuid),
  null,
  'conversation_state.debounce_until agendado no roteamento'
);

-- ── mensagem de OUTRO contato novo do tenant A → conversa distinta, chave de lock distinta ──
select iris.router_route_inbound_message(
  :tenant_a,
  jsonb_build_object(
    'provider', 'evolution', 'tenant_whatsapp_number', '+5511987650001',
    'from', '+5511911118888', 'message_id', 'pgtap-router-3',
    'content', 'contato diferente', 'media_type', 'texto', 'from_me', false,
    'timestamp', '2026-07-12T10:01:00.000Z'
  )
) as conv3 \gset

-- 8. Requisito 2/4 — conversas distintas usam chaves de lock distintas (paralelizáveis):
-- agora há 2 advisory locks na transação (mesma conversa reusa chave; conversa nova adiciona outra)
select is(
  (select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()),
  2,
  'conversa distinta trava chave distinta (2 locks) — conversas diferentes paralelizam, mesma serializa'
);

-- ── RLS: conversation_state do tenant A não vaza para o tenant B (ADR-018/critério RLS) ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :owner_b, 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_b))::text,
  true
);

-- 9. tenant B (autenticado) não enxerga o conversation_state criado p/ conversa do tenant A
select is(
  (select count(*)::int from iris.conversation_state where conversation_id = :'conv1'::uuid),
  0,
  'tenant B NÃO enxerga conversation_state de conversa do tenant A (isolamento RLS)'
);

select * from finish();
rollback;
