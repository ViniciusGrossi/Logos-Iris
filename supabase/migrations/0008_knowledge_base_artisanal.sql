-- Logos Iris — 0008: knowledge_base_entries (enriquecimento do cliente) + artisanal_layer_versions (admin)
-- Duas entidades separadas, versionamento independente (decisão travada no PRD).

create table iris.knowledge_base_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  campo text not null check (campo in ('catalogo', 'faq', 'politicas', 'horarios', 'saudacao', 'nome_agente', 'dados_negocio')),
  conteudo jsonb not null, -- estrutura por campo, nunca textarea livre
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'historico')),
  versao integer not null,
  contradicao_detectada boolean not null default false,
  created_at timestamptz not null default now(),
  publicado_em timestamptz,
  unique (tenant_id, campo, versao)
);

create index kbe_published_idx on iris.knowledge_base_entries (tenant_id, campo) where status = 'publicado';

alter table iris.knowledge_base_entries enable row level security;
alter table iris.knowledge_base_entries force row level security;

create policy kbe_select on iris.knowledge_base_entries
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy kbe_insert on iris.knowledge_base_entries
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy kbe_update on iris.knowledge_base_entries
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy kbe_delete on iris.knowledge_base_entries
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.knowledge_base_entries to authenticated;

-- ── artisanal_layer_versions (entidade própria, autor = admin Logos, editável só via painel admin) ──
create table iris.artisanal_layer_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  conteudo text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'historico')),
  versao integer not null,
  created_at timestamptz not null default now(),
  publicado_em timestamptz,
  unique (tenant_id, versao)
);

create index alv_published_idx on iris.artisanal_layer_versions (tenant_id) where status = 'publicado';

alter table iris.artisanal_layer_versions enable row level security;
alter table iris.artisanal_layer_versions force row level security;

-- SELECT (versão simplificada, via /api/artisanal-layer/summary) para o próprio tenant.
-- INSERT/UPDATE/DELETE: sem policy — admin-only (service_role), nunca editável pelo tenant.
create policy alv_select on iris.artisanal_layer_versions
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select on iris.artisanal_layer_versions to authenticated;
