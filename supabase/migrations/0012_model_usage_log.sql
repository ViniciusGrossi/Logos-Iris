-- Logos Iris — 0012: model_usage_log (CostObservability — módulo 11)
-- Particionada por RANGE(created_at) mensal, mesmo padrão de iris.messages (0006).
-- product.schema.json: "RLS: tenant_id = auth.tenant_id() para leitura do próprio tenant; admin lê todos"
-- — só leitura é mencionada; escrita é da engine via service_role (mesmo shape de model_circuit_state/messages
-- de custo, que também são emitidos pelo ModelGateway, não editados pelo painel cliente).

create table iris.model_usage_log (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  conversation_id uuid not null references iris.conversations (id) on delete cascade,
  model_id uuid not null references iris.model_registry (id) on delete restrict,
  tokens_input integer not null,
  tokens_output integer not null,
  custo_usd numeric(10, 6) not null,
  latencia_ms integer not null,
  escalonou_para_humano boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

create index model_usage_log_tenant_created_idx on iris.model_usage_log (tenant_id, created_at);
create index model_usage_log_model_created_idx on iris.model_usage_log (model_id, created_at);
create index model_usage_log_created_brin_idx on iris.model_usage_log using brin (created_at); -- agregações amplas (CostObservability)

alter table iris.model_usage_log enable row level security;
alter table iris.model_usage_log force row level security;

create policy model_usage_log_select on iris.model_usage_log
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select on iris.model_usage_log to authenticated;
-- INSERT: só o ModelGateway (service_role) grava; admin lê tudo via service_role (bypassa RLS).

-- Pré-cria partições do mês corrente + 12 meses à frente (mesmo colchão de iris.messages em 0006).
-- Reusa iris_private.ensure_monthly_partition(), definida em 0006_messages.sql.
do $$
declare
  i int;
begin
  for i in 0..12 loop
    perform iris_private.ensure_monthly_partition(
      'iris', 'model_usage_log', (date_trunc('month', now()) + (i || ' months')::interval)::date
    );
  end loop;
end;
$$;
