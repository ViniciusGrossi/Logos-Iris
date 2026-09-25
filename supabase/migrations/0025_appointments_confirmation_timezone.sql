-- Logos Iris — 0025: persona-agendamento — confirmação de véspera timezone-aware (Requisitos 2/5,
-- docs/specs/persona-agendamento.md) + reconciliação de drift repo↔banco: tenants.timezone já
-- existia no banco vivo (adicionada solta em sessão anterior) mas sem arquivo de migration
-- correspondente no repo (STATE-PROJECT.md, Bloqueios 2026-09-10) — `if not exists` documenta o
-- estado real sem duplicar/quebrar se já existir.

alter table iris.tenants
  add column if not exists timezone text not null default 'America/Sao_Paulo';

-- ── iris.appointments_due_for_confirmation — véspera calculada no fuso do TENANT, nunca UTC fixo ──
-- "amanhã" é (horario AT TIME ZONE tenant.timezone)::date = ((now() AT TIME ZONE tenant.timezone) +
-- 1 dia)::date — cálculo por linha, nativo do Postgres, sem loop em aplicação. Requisito 5: já que
-- tenants.timezone agora existe (coluna acima), não há mais "modo degradado" — todo tenant tem um
-- fuso definido (default América/São Paulo, PMEs BR).
create or replace function iris.appointments_due_for_confirmation()
returns table (
  appointment_id uuid,
  tenant_id uuid,
  contact_id uuid,
  conversation_id uuid,
  horario timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select a.id, a.tenant_id, a.contact_id, a.conversation_id, a.horario
  from iris.appointments a
  join iris.tenants t on t.id = a.tenant_id
  where a.status in ('agendado', 'confirmado')
    and a.confirmacao_enviada_em is null
    and (a.horario at time zone t.timezone)::date = ((now() at time zone t.timezone) + interval '1 day')::date;
$$;

revoke execute on function iris.appointments_due_for_confirmation() from public, anon, authenticated;
grant execute on function iris.appointments_due_for_confirmation() to service_role;

-- ── iris.appointments_mark_confirmation_sent — grava confirmacao_enviada_em (Requisito 2) ──
create or replace function iris.appointments_mark_confirmation_sent(p_appointment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update iris.appointments
     set confirmacao_enviada_em = now()
   where id = p_appointment_id;
$$;

revoke execute on function iris.appointments_mark_confirmation_sent(uuid) from public, anon, authenticated;
grant execute on function iris.appointments_mark_confirmation_sent(uuid) to service_role;

-- ── iris.gateway_get_contact_phone — decripta telefone pro worker enviar a confirmação ──
-- Mesmo padrão de iris.memory_get_latest_summary (0020): wrapper SECURITY DEFINER que decripta
-- SEM expor iris_private inteiro nem o bytea cru ao caller service_role.
create or replace function iris.gateway_get_contact_phone(p_tenant_id uuid, p_contact_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select iris_private.decrypt_pii(telefone_enc)
  from iris.contacts
  where id = p_contact_id
    and tenant_id = p_tenant_id
    and deleted_at is null;
$$;

revoke execute on function iris.gateway_get_contact_phone(uuid, uuid) from public, anon, authenticated;
grant execute on function iris.gateway_get_contact_phone(uuid, uuid) to service_role;

-- ── cron — dispara o appointment-confirmation-worker de hora em hora ──
-- DESVIO: hourly (não "1x/dia" literal da spec) — tenants BR em fusos distintos (raro, mas
-- possível) tornariam um único horário fixo UTC impreciso pra "véspera" de alguns; o filtro real
-- de "é véspera" já é 100% SQL/timezone-aware acima (appointments_due_for_confirmation), então
-- rodar de hora em hora só reduz a latência entre "virou véspera no fuso do tenant" e o envio, sem
-- reenviar (confirmacao_enviada_em já marcado torna a query idempotente). Mesmo padrão de
-- pg_cron+pg_net+token dedicado de 0017/0019/0022.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_appointments_confirmation_tick') then
    perform cron.unschedule('iris_appointments_confirmation_tick');
  end if;
end;
$$;

select cron.schedule(
  'iris_appointments_confirmation_tick',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://nqubjiosnlaatxxamiut.supabase.co/functions/v1/appointment-confirmation-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || iris_private.tenant_router_worker_token()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
