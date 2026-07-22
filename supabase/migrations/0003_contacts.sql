-- Logos Iris — 0003: contacts (primeira tabela com PII — pgcrypto de 0001 já disponível)

create table iris.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  telefone_hash bytea not null, -- iris_private.phone_hash(telefone) — lookup determinístico do webhook
  telefone_enc bytea not null,  -- iris_private.encrypt_pii(telefone) — leitura
  nome_enc bytea,               -- iris_private.encrypt_pii(nome), nullable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- apagar contato dispara esquecimento (ADR-026): memória + embeddings associados
  unique (tenant_id, telefone_hash)
);

create index contacts_tenant_id_idx on iris.contacts (tenant_id);

create trigger contacts_set_updated_at
  before update on iris.contacts
  for each row execute function iris_private.set_updated_at();

alter table iris.contacts enable row level security;
alter table iris.contacts force row level security;

create policy contacts_select on iris.contacts
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy contacts_insert on iris.contacts
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy contacts_update on iris.contacts
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy contacts_delete on iris.contacts
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.contacts to authenticated;
-- Webhook (Edge Function) roda com service_role — bypassa RLS, mas precisa das mesmas
-- funções iris_private.phone_hash/encrypt_pii já concedidas a service_role em 0001.
