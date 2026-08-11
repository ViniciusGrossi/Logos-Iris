-- Logos Iris — 0017: scheduling do tenant-router-worker via pg_cron + pg_net
-- Achado CRÍTICO do spec-reviewer (aaff386f77f88e4f5): nada invocava a Edge Function periodicamente
-- — mensagens ficavam paradas em pgmq `whatsapp_inbound` pra sempre, então nenhum dos Requisitos
-- 1-5 da spec se manifestava em produção. Decisão de Vinicius (STATE-PROJECT.md, 2026-08-07):
-- corrigir agora (build), não deferir p/ Fase 12 (Deploy). Padrão idempotente de cron.schedule
-- segue 0013 (partition_maintenance_cron); padrão de secret em Vault segue 0001
-- (extensions_pgcrypto_vault).
--
-- Autenticação da chamada: nem app.settings.service_role_key nem app.settings.jwt_secret estão
-- disponíveis nesta versão do Postgres hospedado (confirmado ao vivo antes de escrever esta
-- migration — current_setting() para os dois retorna null) — Supabase removeu essa exposição de
-- GUC por segurança. Em vez de precisar colar a service_role key do projeto em texto puro em
-- algum ponto do processo (o que a spec explicitamente proíbe), o worker autentica com um TOKEN
-- DEDICADO gerado inteiramente dentro do Postgres (mesmo padrão do pepper HMAC em 0001: gerado
-- com gen_random_bytes, nunca aparece como literal em SQL versionado) e guardado no Vault. A
-- comparação do token recebido roda 100% em SQL (iris.router_worker_verify_token) — a Edge
-- Function nunca vê o valor real, só recebe true/false. A function é deployada com
-- verify_jwt=false (chamada interna do cron, não é endpoint de usuário; auth customizada
-- documentada no próprio index.ts).
--
-- Frequência: pg_cron tem granularidade mínima de 1 minuto — aceitável aqui porque o debounce de
-- 8s do módulo 3 (message-debouncer) já introduz atraso maior que isso na resposta ao usuário
-- final; sub-minuto não é crítico agora. Revisar se volume/latência exigir no futuro.

create extension if not exists pg_net;

-- ── Vault: token dedicado que autentica a chamada HTTP do pg_cron ao worker ──
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'iris_tenant_router_worker_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'iris_tenant_router_worker_token',
      'Logos Iris — token dedicado que autentica a chamada HTTP do pg_cron (via pg_net) ao ' ||
      'tenant-router-worker. A Edge Function roda com verify_jwt=false e valida este token no ' ||
      'header Authorization via iris.router_worker_verify_token — nunca a service_role key do projeto.'
    );
  end if;
end;
$$;

create or replace function iris_private.tenant_router_worker_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'iris_tenant_router_worker_token';
$$;

revoke execute on function iris_private.tenant_router_worker_token() from public, anon, authenticated;
grant execute on function iris_private.tenant_router_worker_token() to service_role;

-- ── iris.router_worker_verify_token — compara o token recebido SEM devolver o valor real ──
-- Exposta no schema `iris` (não `iris_private`) só porque é a única forma de o worker Deno
-- (client Data API, sem acesso direto a `iris_private`) checar o token via .rpc(); o valor
-- decifrado em si nunca sai de dentro desta função.
create or replace function iris.router_worker_verify_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select p_token is not distinct from iris_private.tenant_router_worker_token();
$$;

revoke execute on function iris.router_worker_verify_token(text) from public, anon, authenticated;
grant execute on function iris.router_worker_verify_token(text) to service_role;

-- ── cron job — invoca a Edge Function via HTTP a cada minuto ──
-- Idempotente: reagendar a migration não deve duplicar o job (mesmo padrão de 0013).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'iris_tenant_router_tick') then
    perform cron.unschedule('iris_tenant_router_tick');
  end if;
end;
$$;

select cron.schedule(
  'iris_tenant_router_tick',
  '* * * * *', -- a cada minuto (granularidade mínima do pg_cron)
  $$
  select net.http_post(
    url := 'https://nqubjiosnlaatxxamiut.supabase.co/functions/v1/tenant-router-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || iris_private.tenant_router_worker_token()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
