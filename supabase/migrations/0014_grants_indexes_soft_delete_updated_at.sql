-- Logos Iris — 0014: fix achados @revisor-codigo (playbook fase 6, gate 4.5)
-- CRÍTICO: service_role sem nenhum grant de tabela em iris (BYPASSRLS != GRANT — todo caminho
-- quente webhook/engine quebraria em runtime na fase 7). + 4 achados baratos na mesma leva.

-- ── 1. CRÍTICO: grants de tabela pra service_role (schema inteiro + default pra tabelas futuras) ──
grant select, insert, update, delete on all tables in schema iris to service_role;
alter default privileges in schema iris grant select, insert, update, delete on tables to service_role;

-- ── 2. Índices FK faltando (seq scan em cascade/filtro) ──
create index conversation_state_tenant_id_idx on iris.conversation_state (tenant_id);
create index messages_model_id_idx on iris.messages (model_id);
create index model_usage_log_conversation_id_idx on iris.model_usage_log (conversation_id);

-- ── 3. Soft delete vazando em SELECT: tenants, contacts, tenant_members ──
drop policy tenants_select_own on iris.tenants;
create policy tenants_select_own on iris.tenants
  for select to authenticated
  using (
    id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid)
    and deleted_at is null
  );

drop policy contacts_select on iris.contacts;
create policy contacts_select on iris.contacts
  for select to authenticated
  using (
    tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid)
    and deleted_at is null
  );

drop policy tenant_members_select on iris.tenant_members;
create policy tenant_members_select on iris.tenant_members
  for select to authenticated
  using (
    tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid)
    and deleted_at is null
  );

-- ── 4. updated_at faltando: handoff_events, follow_ups, contact_memory_summaries ──
-- (têm policy de UPDATE + colunas mutáveis, mas nenhum trigger set_updated_at — mesmo padrão das outras tabelas)
alter table iris.handoff_events add column updated_at timestamptz not null default now();
create trigger handoff_events_set_updated_at
  before update on iris.handoff_events
  for each row execute function iris_private.set_updated_at();

alter table iris.follow_ups add column updated_at timestamptz not null default now();
create trigger follow_ups_set_updated_at
  before update on iris.follow_ups
  for each row execute function iris_private.set_updated_at();

alter table iris.contact_memory_summaries add column updated_at timestamptz not null default now();
create trigger cms_set_updated_at
  before update on iris.contact_memory_summaries
  for each row execute function iris_private.set_updated_at();

-- ── 5. anon com USAGE desnecessário no schema iris (0002 linha 5) ──
-- anon não tem grant de tabela nem policy em schema nenhum de iris — usage sobrando.
revoke usage on schema iris from anon;
