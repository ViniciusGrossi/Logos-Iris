-- Logos Iris — 0022: contact-memory — geração de resumo + purge de retenção + cascata de
-- esquecimento (docs/specs/contact-memory.md). Nenhuma tabela nova — aditivo puro sobre
-- contact_memory_summaries (0007/0014), messages (0006), knowledge_chunks (0009), contacts (0003),
-- plans/tenants (0002). Leitura (memory_get_latest_summary) já existe (0020, feature
-- persona-atendimento) — esta migração cobre só o lado oposto: geração/expiração/cascata.
--
-- Padrões reusados (não reinventados):
--  - RPC wrapper SECURITY DEFINER em `iris` p/ acesso a iris_private/pgmq via Data API: 0015/0016/0020.
--  - pg_cron idempotente (unschedule + reschedule): 0013/0017/0019.
--  - pg_cron → pg_net → Edge Function com token dedicado em Vault: 0017/0019 (reusa o MESMO
--    token — iris_private.tenant_router_worker_token()/iris.router_worker_verify_token — em vez
--    de criar um novo secret; 0019 já estabeleceu esse reuso pro debouncer-flush-worker).
--  - Manutenção 100% SQL sem Edge Function (purge diário, gap de retenção): 0013 (ensure_next_partitions).

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Requisito 1/6 — iris.memory_fetch_messages_for_period: mensagens brutas (decriptadas) do
--    contato no período, uso TRANSIENTE só pelo ContactMemoryService (nunca persistidas de volta).
-- ══════════════════════════════════════════════════════════════════════════
create or replace function iris.memory_fetch_messages_for_period(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_periodo_inicio timestamptz,
  p_periodo_fim timestamptz
)
returns table (
  conteudo text,
  direcao text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    iris_private.decrypt_pii(m.conteudo_enc) as conteudo,
    m.direcao
  from iris.messages m
  join iris.conversations conv on conv.id = m.conversation_id
  where m.tenant_id = p_tenant_id
    and conv.contact_id = p_contact_id
    and conv.tenant_id = p_tenant_id -- defesa em profundidade (conv já é filtrado por contact_id, que é único por tenant)
    and m.created_at > p_periodo_inicio
    and m.created_at <= p_periodo_fim
  order by m.created_at asc;
$$;

revoke execute on function iris.memory_fetch_messages_for_period(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function iris.memory_fetch_messages_for_period(uuid, uuid, timestamptz, timestamptz) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Requisito 1/2 — iris.memory_create_summary: persiste o resumo já sintetizado (nunca texto
--    bruto — chamado só depois que o ContactMemoryService já tem o resumo do generator).
--    expira_em é derivado de plans.retencao_memoria_dias do tenant AQUI DENTRO, atômico com o
--    insert — "no momento da criação do resumo" (Requisito 2) não tem gap de race condition.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function iris.memory_create_summary(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_resumo text,
  p_periodo_inicio timestamptz,
  p_periodo_fim timestamptz
)
returns table (
  id uuid,
  contact_id uuid,
  tenant_id uuid,
  resumo text,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  expira_em timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retencao_dias integer;
  v_expira_em timestamptz;
  v_id uuid;
  v_created_at timestamptz;
begin
  select p.retencao_memoria_dias into v_retencao_dias
  from iris.tenants t
  join iris.plans p on p.id = t.plano_id
  where t.id = p_tenant_id;

  if v_retencao_dias is null then
    raise exception 'memory_create_summary: tenant % sem plano de retenção associado (tenant inexistente?)', p_tenant_id
      using errcode = 'P0002';
  end if;

  v_expira_em := now() + make_interval(days => v_retencao_dias);

  insert into iris.contact_memory_summaries (contact_id, tenant_id, resumo_enc, periodo_inicio, periodo_fim, expira_em)
  values (p_contact_id, p_tenant_id, iris_private.encrypt_pii(p_resumo), p_periodo_inicio, p_periodo_fim, v_expira_em)
  returning contact_memory_summaries.id, contact_memory_summaries.created_at into v_id, v_created_at;

  return query
    select v_id, p_contact_id, p_tenant_id, p_resumo, p_periodo_inicio, p_periodo_fim, v_expira_em, v_created_at;
end;
$$;

revoke execute on function iris.memory_create_summary(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function iris.memory_create_summary(uuid, uuid, text, timestamptz, timestamptz) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Requisito 3 — purge diário de retenção vencida (LGPD/ADR-026). 100% SQL, sem Edge Function
--    (mesmo padrão de iris_private.ensure_next_partitions, 0013) — não há lógica de negócio aqui,
--    só um DELETE agendado, não precisa do overhead de pgmq/Edge Function.
--    Cascata de higiene: junto com o resumo vencido, purga também os knowledge_chunks
--    (source_type='contact_memory') que apontam pra ele via source_id — órfão de PII expirada
--    seria um resíduo LGPD, mesmo raciocínio do índice kc_source_id_idx (comentário em 0009).
-- ══════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron with schema extensions;

create or replace function iris_private.purge_expired_contact_memory()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with purged as (
    delete from iris.contact_memory_summaries
    where expira_em <= now()
    returning id
  ),
  purged_chunks as (
    delete from iris.knowledge_chunks kc
    using purged p
    where kc.source_type = 'contact_memory' and kc.source_id = p.id
    returning kc.id
  )
  select count(*) into v_count from purged;

  return v_count;
end;
$$;

revoke execute on function iris_private.purge_expired_contact_memory() from public, anon, authenticated;

-- Idempotente: reagendar a migration não deve duplicar o job (mesmo padrão de 0013/0017/0019).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_contact_memory_purge_expired') then
    perform cron.unschedule('iris_contact_memory_purge_expired');
  end if;
end;
$$;

select cron.schedule(
  'iris_contact_memory_purge_expired',
  '0 4 * * *', -- diário, 04:00 UTC (fora do horário de pico de nenhum fuso alvo — PMEs BR)
  $$ select iris_private.purge_expired_contact_memory(); $$
);

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Requisito 5 — cascata de esquecimento: contacts.deleted_at (soft delete) dispara hard-delete
--    de contact_memory_summaries + knowledge_chunks(source_type='contact_memory') do contato.
--    Trigger, não FK on delete cascade: contacts é SOFT delete (deleted_at), a linha nunca é
--    fisicamente apagada, então "on delete cascade" da FK (0007) nunca dispara sozinho aqui.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function iris_private.contacts_cascade_forget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from iris.contact_memory_summaries where contact_id = new.id;
  delete from iris.knowledge_chunks where contact_id = new.id and source_type = 'contact_memory';
  return new;
end;
$$;

-- create or replace trigger (PG14+, Supabase roda PG15 — CLAUDE.md) garante idempotência ao
-- reaplicar a migration, mesmo espírito do unschedule+reschedule usado nos cron jobs acima.
create or replace trigger contacts_cascade_forget_trigger
  after update on iris.contacts
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function iris_private.contacts_cascade_forget();

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Fila pgmq + RPCs de consumo — "job periódico → pgmq → Edge Function" (Restrições Técnicas
--    da spec). Produtor: iris_private.enqueue_contact_memory_summarization (cron diário, abaixo).
--    Consumidor: contact-memory-summarizer-worker (Edge Function), via os wrappers desta seção
--    (mesmo padrão de iris.router_consume_whatsapp_inbound/router_delete_whatsapp_inbound, 0016).
-- ══════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'contact_memory_summarize') then
    perform pgmq.create('contact_memory_summarize');
  end if;
end;
$$;

create or replace function iris.memory_consume_summarize_queue(p_max integer)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('msg_id', q.msg_id, 'message', q.message)),
    '[]'::jsonb
  )
  -- vt=60s: mensagem fica invisível 60s; se o worker cair antes de deletar, reaparece (retry
  -- automático). Reprocesso é seguro — memory_create_summary é um INSERT novo por chamada (não
  -- há unicidade lógica período/contato nesta v1), então um resumo duplicado no pior caso é
  -- inofensivo (ambos válidos, o mais recente vence em memory_get_latest_summary, 0020).
  from pgmq.read('contact_memory_summarize', 60, p_max) as q;
$$;

revoke execute on function iris.memory_consume_summarize_queue(integer) from public, anon, authenticated;
grant execute on function iris.memory_consume_summarize_queue(integer) to service_role;

create or replace function iris.memory_delete_summarize_queue_item(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete('contact_memory_summarize', p_msg_id);
$$;

revoke execute on function iris.memory_delete_summarize_queue_item(bigint) from public, anon, authenticated;
grant execute on function iris.memory_delete_summarize_queue_item(bigint) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. Produtor — enfileira 1 job por contato com mensagem nova desde o último resumo (ou desde a
--    criação do contato, se nunca resumido). Só enfileira quando há pelo menos 1 mensagem nova —
--    evita job vazio (NoMessagesInPeriodError no Service seria um item de fila descartado à toa).
--    ponytail: varre todos os contatos ativos de todos os tenants 1x/dia — aceitável no volume
--    desta v1 (mesmo tipo de default documentado em 0016 DESVIO 3); revisar se o volume crescer.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function iris_private.enqueue_contact_memory_summarization()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_contact record;
begin
  for v_contact in
    select
      c.id as contact_id,
      c.tenant_id,
      coalesce(
        (select max(cms.periodo_fim) from iris.contact_memory_summaries cms where cms.contact_id = c.id),
        -- contato nunca resumido: usa created_at - 1us em vez de created_at puro, senão uma
        -- mensagem inserida no MESMO instante (mesma transação, ex.: find-or-create em
        -- router_route_inbound_message, 0016) empataria com o filtro "> periodo_inicio" abaixo
        -- e nunca seria capturada — `now()` é estável por transação em Postgres.
        c.created_at - interval '1 microsecond'
      ) as periodo_inicio
    from iris.contacts c
    where c.deleted_at is null
  loop
    if exists (
      select 1
      from iris.messages m
      join iris.conversations conv on conv.id = m.conversation_id
      where conv.contact_id = v_contact.contact_id
        and m.tenant_id = v_contact.tenant_id
        and m.created_at > v_contact.periodo_inicio
        and m.created_at <= now()
      limit 1
    ) then
      perform pgmq.send(
        'contact_memory_summarize',
        jsonb_build_object(
          'tenant_id', v_contact.tenant_id,
          'contact_id', v_contact.contact_id,
          'periodo_inicio', v_contact.periodo_inicio,
          'periodo_fim', now()
        )
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function iris_private.enqueue_contact_memory_summarization() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_contact_memory_summarize_enqueue') then
    perform cron.unschedule('iris_contact_memory_summarize_enqueue');
  end if;
end;
$$;

select cron.schedule(
  'iris_contact_memory_summarize_enqueue',
  '0 2 * * *', -- diário, 02:00 UTC — antes do purge (04:00 UTC), sem overlap de propósito
  $$ select iris_private.enqueue_contact_memory_summarization(); $$
);

-- ══════════════════════════════════════════════════════════════════════════
-- 7. Tick — drena a fila via a Edge Function contact-memory-summarizer-worker. Mesmo padrão de
--    autenticação de 0017/0019: reusa o token dedicado já existente em Vault
--    (iris_private.tenant_router_worker_token()/iris.router_worker_verify_token), sem criar um
--    novo secret — 0019 já estabeleceu esse reuso entre workers distintos.
-- ══════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_contact_memory_summarize_tick') then
    perform cron.unschedule('iris_contact_memory_summarize_tick');
  end if;
end;
$$;

select cron.schedule(
  'iris_contact_memory_summarize_tick',
  '* * * * *', -- a cada minuto (granularidade mínima do pg_cron, mesmo padrão de 0017/0019)
  $$
  select net.http_post(
    url := 'https://nqubjiosnlaatxxamiut.supabase.co/functions/v1/contact-memory-summarizer-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || iris_private.tenant_router_worker_token()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
