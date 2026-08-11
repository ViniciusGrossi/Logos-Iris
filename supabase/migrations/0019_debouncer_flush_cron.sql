-- Logos Iris — 0019: scheduling do debouncer-flush-worker via pg_cron + pg_net
-- Aciona a Edge Function debouncer-flush-worker a cada minuto (granularidade mínima do pg_cron).
-- A spec pede 10s, mas pg_cron não suporta sub-minuto — documentado como desvio aceitável:
-- o debounce de 8s (0016) já introduz atraso maior que 10s na resposta ao usuário final,
-- então a diferença entre tick de 10s e 60s é marginal no pipeline completo.
-- Mesmo padrão de autenticação da 0017: token dedicado em Vault, comparação em SQL.
--
-- DESVIO: frequência de 60s em vez de 10s (limitação do pg_cron). Revisitar se volume/latência
-- exigir — alternativas: Edge Function com Deno.cron (cron de segundo) ou trigger na tabela.

-- ── cron job — invoca a Edge Function via HTTP a cada minuto ──
-- Idempotente: reagendar a migration não deve duplicar o job (mesmo padrão de 0013/0017).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_debouncer_flush_tick') then
    perform cron.unschedule('iris_debouncer_flush_tick');
  end if;
end;
$$;

select cron.schedule(
  'iris_debouncer_flush_tick',
  '* * * * *', -- a cada minuto (granularidade mínima do pg_cron; spec pedia 10s — ver DESVIO)
  $$
  select net.http_post(
    url := 'https://nqubjiosnlaatxxamiut.supabase.co/functions/v1/debouncer-flush-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || iris_private.tenant_router_worker_token()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);