-- Logos Iris — 0007: contact_memory_summaries (memória longa — resumos, nunca transcrição integral, LGPD)

create table iris.contact_memory_summaries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references iris.contacts (id) on delete cascade,
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  resumo_enc bytea not null, -- iris_private.encrypt_pii(resumo)
  periodo_inicio timestamptz not null,
  periodo_fim timestamptz not null,
  expira_em timestamptz not null, -- derivado de plans.retencao_memoria_dias (ADR-026)
  created_at timestamptz not null default now()
);

create index cms_contact_periodo_idx on iris.contact_memory_summaries (contact_id, periodo_fim desc);
create index cms_expira_em_idx on iris.contact_memory_summaries (expira_em);
create index cms_tenant_id_idx on iris.contact_memory_summaries (tenant_id);

alter table iris.contact_memory_summaries enable row level security;
alter table iris.contact_memory_summaries force row level security;

create policy cms_select on iris.contact_memory_summaries
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy cms_insert on iris.contact_memory_summaries
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy cms_update on iris.contact_memory_summaries
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy cms_delete on iris.contact_memory_summaries
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.contact_memory_summaries to authenticated;
