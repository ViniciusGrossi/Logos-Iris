-- Logos Iris — 0016: tenant-router-queue (módulo 2, docs/specs/tenant-router-queue.md)
-- Nenhuma tabela nova (aditivo puro sobre 0003/0005/0006/0015). Três funções SECURITY DEFINER
-- em iris (schema exposto) — pgmq e o advisory lock não são alcançáveis via PostgREST, e a
-- unidade de trabalho do roteador PRECISA rodar numa única transação para o lock valer
-- (pg_advisory_xact_lock é escopo de transação; PostgREST é txn-por-statement).
--
-- DESVIOS (ver relatório do worker → SYNC REQUESTS):
--  1. Chave do advisory lock = hashtext(tenant_id || contact_id), não hashtext(conversation_id)
--     literal da spec: na 1ª mensagem a conversa ainda não existe. (tenant, contact) é a
--     identidade estável da única conversa ativa por contato — mesma garantia de serialização.
--  2. Persona da conversa NOVA = primeira de tenants.personas_ativas (fallback 'atendimento').
--     A escolha de persona é lógica de produto fora do contrato; default documentado p/ manter
--     o módulo funcional.
--  3. Janela de debounce (8s) e horizonte do state (1 dia) são defaults de produto, não da spec.

-- ── iris.router_route_inbound_message — unidade atômica de roteamento sob advisory lock ──
create or replace function iris.router_route_inbound_message(p_tenant_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from        text := p_payload ->> 'from';
  v_message_id  text := p_payload ->> 'message_id';
  v_media_type  text := coalesce(p_payload ->> 'media_type', 'texto');
  v_content     text := coalesce(p_payload ->> 'content', '');
  v_contact_id      uuid;
  v_conversation_id uuid;
  v_persona     text;
  v_debounce_seconds constant int := 8; -- ponytail: default de produto; SYNC valor real
  v_expires_days     constant int := 1; -- ponytail: horizonte curto do state; SYNC valor real
begin
  if v_from is null or length(v_from) = 0 or v_message_id is null or length(v_message_id) = 0 then
    raise exception 'router_route_inbound_message: payload sem from/message_id' using errcode = '22023';
  end if;

  -- find-or-create contact — atômico via unique(tenant_id, telefone_hash), sem race.
  insert into iris.contacts (tenant_id, telefone_hash, telefone_enc)
  values (p_tenant_id, iris_private.phone_hash(v_from), iris_private.encrypt_pii(v_from))
  on conflict (tenant_id, telefone_hash) do nothing;

  select id into v_contact_id
  from iris.contacts
  where tenant_id = p_tenant_id and telefone_hash = iris_private.phone_hash(v_from)
  limit 1;

  -- Requisitos 2 e 3 — advisory lock por conversa (chave estável derivada de tenant+contato,
  -- ver DESVIO 1). Serializa mensagens da MESMA conversa; conversas distintas não colidem
  -- (hashes diferentes). Escopo de transação: liberado no commit/rollback.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || v_contact_id::text));

  -- conversa ativa do contato (a única, garantida pelo lock) ou cria uma.
  select id into v_conversation_id
  from iris.conversations
  where tenant_id = p_tenant_id and contact_id = v_contact_id and status = 'ativa'
  order by updated_at desc
  limit 1;

  if v_conversation_id is null then
    -- persona default (DESVIO 2): primeira personas_ativas do tenant, fallback 'atendimento'.
    select coalesce(
      (select t.personas_ativas[1]
         from iris.tenants t
        where t.id = p_tenant_id and array_length(t.personas_ativas, 1) >= 1),
      'atendimento'
    ) into v_persona;

    insert into iris.conversations (tenant_id, contact_id, persona_ativa, status)
    values (p_tenant_id, v_contact_id, v_persona, 'ativa')
    returning id into v_conversation_id;
  end if;

  -- Persiste a mensagem recebida — buffer que a engine (módulo 3) lê após o debounce.
  insert into iris.messages (tenant_id, conversation_id, provider_message_id, conteudo_enc, direcao, tipo_midia)
  values (p_tenant_id, v_conversation_id, v_message_id, iris_private.encrypt_pii(v_content), 'recebida', v_media_type);

  -- Agenda/renova o debounce (DESVIO 3) — conversation_state é 1:1 com a conversa.
  insert into iris.conversation_state (conversation_id, tenant_id, debounce_until, expires_at)
  values (
    v_conversation_id, p_tenant_id,
    now() + make_interval(secs => v_debounce_seconds),
    now() + make_interval(days => v_expires_days)
  )
  on conflict (conversation_id) do update
    set debounce_until = now() + make_interval(secs => v_debounce_seconds),
        expires_at     = now() + make_interval(days => v_expires_days);

  return v_conversation_id;
end;
$$;

revoke execute on function iris.router_route_inbound_message(uuid, jsonb) from public, anon, authenticated;
grant execute on function iris.router_route_inbound_message(uuid, jsonb) to service_role;

-- ── iris.router_consume_whatsapp_inbound — lê um lote da fila sem expor pgmq inteiro ──
-- vt=30s: mensagem fica invisível 30s; se o worker cair antes de deletar, reaparece (retry
-- automático). Reprocesso é seguro — webhook_inbox garante idempotência (Requisito 4).
create or replace function iris.router_consume_whatsapp_inbound(p_max integer)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('msg_id', q.msg_id, 'message', q.message)),
    '[]'::jsonb
  )
  from pgmq.read('whatsapp_inbound', 30, p_max) as q;
$$;

revoke execute on function iris.router_consume_whatsapp_inbound(integer) from public, anon, authenticated;
grant execute on function iris.router_consume_whatsapp_inbound(integer) to service_role;

-- ── iris.router_delete_whatsapp_inbound — remove da fila após roteamento terminal ──
create or replace function iris.router_delete_whatsapp_inbound(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete('whatsapp_inbound', p_msg_id);
$$;

revoke execute on function iris.router_delete_whatsapp_inbound(bigint) from public, anon, authenticated;
grant execute on function iris.router_delete_whatsapp_inbound(bigint) to service_role;
