-- Logos Iris — 0006: messages (particionada por RANGE(created_at) mensal) + webhook_inbox
-- PII em conteudo_enc. tenant_id denormalizado (RLS sem join). Idempotência NÃO é aqui — ver webhook_inbox
-- (unique global de messages particionada exigiria created_at na chave, quebrando unicidade do id do provedor — ADR-028).

create table iris.messages (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  conversation_id uuid not null references iris.conversations (id) on delete cascade,
  provider_message_id text,
  conteudo_enc bytea not null, -- iris_private.encrypt_pii(conteudo)
  direcao text not null check (direcao in ('recebida', 'enviada')),
  tipo_midia text not null default 'texto' check (tipo_midia in ('texto', 'audio', 'imagem', 'documento')),
  from_me_detectado boolean not null default false,
  model_id uuid references iris.model_registry (id) on delete set null, -- nulo se mensagem do cliente/humano
  tokens_input integer,
  tokens_output integer,
  custo_usd numeric(10, 6),
  latencia_ms integer,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

create index messages_conv_created_idx on iris.messages (conversation_id, created_at desc);
create index messages_tenant_idx on iris.messages (tenant_id);

alter table iris.messages enable row level security;
alter table iris.messages force row level security;

create policy messages_select on iris.messages
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy messages_insert on iris.messages
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy messages_update on iris.messages
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy messages_delete on iris.messages
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.messages to authenticated;

-- ── Manutenção de partições (gap #3 do review inline /supabase-postgres-best-practices) ──
-- Função genérica, reutilizada por messages e model_usage_log (0010). Cria a partição mensal
-- de p_table se ainda não existir. Cron de agendamento contínuo vem em 0012_partition_maintenance.sql.
create or replace function iris_private.ensure_monthly_partition(p_schema text, p_table text, p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_partition_name text := p_table || '_' || to_char(v_start, 'YYYY_MM');
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = p_schema and c.relname = v_partition_name
  ) then
    execute format(
      'create table %I.%I partition of %I.%I for values from (%L) to (%L)',
      p_schema, v_partition_name, p_schema, p_table, v_start, v_end
    );
  end if;
end;
$$;

revoke execute on function iris_private.ensure_monthly_partition(text, text, date) from public, anon, authenticated;
grant execute on function iris_private.ensure_monthly_partition(text, text, date) to service_role;

-- Pré-cria partições do mês corrente + 12 meses à frente (colchão além do cron mensal de 0012).
do $$
declare
  i int;
begin
  for i in 0..12 loop
    perform iris_private.ensure_monthly_partition(
      'iris', 'messages', (date_trunc('month', now()) + (i || ' months')::interval)::date
    );
  end loop;
end;
$$;

-- ── webhook_inbox (dedup global, não-particionada, TTL 7d — ADR-028, ADR-018 service-role-only) ──
create table iris.webhook_inbox (
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  provider_message_id text not null,
  received_at timestamptz not null default now(),
  primary key (tenant_id, provider_message_id)
);

create index webhook_inbox_received_at_idx on iris.webhook_inbox (received_at); -- suporte ao purge TTL 7d

alter table iris.webhook_inbox enable row level security;
alter table iris.webhook_inbox force row level security;
-- ADR-018: RLS ON sem policy — só o webhook (service_role) lê/escreve.
