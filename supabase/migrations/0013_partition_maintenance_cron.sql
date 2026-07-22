-- Logos Iris — 0013: manutenção contínua de partições (gap #3 do review inline /supabase-postgres-best-practices)
-- 0006 e 0012 pré-criam mês corrente + 12 meses à frente para messages/model_usage_log — colchão inicial.
-- Sem manutenção contínua, o INSERT falha assim que o colchão pré-criado acabar. Este job mensal via pg_cron
-- garante que sempre exista partição para "mês corrente + 13" — repetido todo mês, mantém ~12 meses de folga
-- perpétuos à frente do mês corrente, sem intervenção manual.

create extension if not exists pg_cron with schema extensions;

create or replace function iris_private.ensure_next_partitions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform iris_private.ensure_monthly_partition('iris', 'messages', (date_trunc('month', now()) + interval '13 months')::date);
  perform iris_private.ensure_monthly_partition('iris', 'model_usage_log', (date_trunc('month', now()) + interval '13 months')::date);
end;
$$;

revoke execute on function iris_private.ensure_next_partitions() from public, anon, authenticated;

-- Idempotente: reagendar a migration não deve duplicar o job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_ensure_next_partitions') then
    perform cron.unschedule('iris_ensure_next_partitions');
  end if;
end;
$$;

select cron.schedule(
  'iris_ensure_next_partitions',
  '0 3 1 * *', -- todo dia 1, 03:00 UTC
  $$ select iris_private.ensure_next_partitions(); $$
);
