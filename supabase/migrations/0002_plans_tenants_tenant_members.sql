-- Logos Iris — 0002: plans, tenants, tenant_members, whatsapp_connections
-- Sem PII. RLS padrão: tenant_id = (select nullif(auth.jwt()->'app_metadata'->>'tenant_id','')::uuid)
-- Admin (Vinicius) nunca passa por RLS de tenant — service_role client no Service layer (ADR-030).

grant usage on schema iris to anon, authenticated, service_role;

-- ── plans (global, sem tenant_id) ──────────────────────────────────────────
create table iris.plans (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  max_personas_ativas integer not null,
  roteador_invisivel_incluso boolean not null default false,
  tier_modelo text not null check (tier_modelo in ('basico', 'premium')),
  limite_mensagens_mes integer not null,
  retencao_memoria_dias integer not null default 90,
  follow_ups_automaticos_mes integer not null,
  auditoria_qualidade_incluida boolean not null default false,
  seats_painel integer not null default 1,
  api_oficial_meta_addon_disponivel boolean not null default false,
  voz_clonada_addon_disponivel boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on iris.plans
  for each row execute function iris_private.set_updated_at();

alter table iris.plans enable row level security;
alter table iris.plans force row level security;

-- Qualquer tenant autenticado precisa comparar o próprio plano com os demais (upgrade).
create policy plans_select_authenticated on iris.plans
  for select to authenticated
  using (true);
-- INSERT/UPDATE/DELETE: sem policy — só admin via service_role (bypassa RLS).

grant select on iris.plans to authenticated;

-- ── tenants ─────────────────────────────────────────────────────────────────
create table iris.tenants (
  id uuid primary key default gen_random_uuid(),
  nome_empresa text not null,
  plano_id uuid not null references iris.plans (id) on delete restrict,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'cancelado')),
  whatsapp_provider text not null check (whatsapp_provider in ('evolution', 'openwa', 'cloud_api')),
  whatsapp_number text not null,
  whatsapp_connection_status text not null default 'desconectado'
    check (whatsapp_connection_status in ('conectado', 'desconectado', 'pareando')),
  personas_ativas text[] not null default '{}'
    check (personas_ativas <@ array['atendimento', 'vendas', 'agendamento', 'sdr']::text[]),
  roteador_invisivel_ativo boolean not null default false,
  -- Gap aprovado 2026-07-12 (STATE-PROJECT.md task 8.1 / ARCHITECTURE.md "Risco em aberto" #1):
  -- jobs de confirmação de véspera e resumo diário precisam de timezone por tenant.
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index tenants_whatsapp_number_key on iris.tenants (whatsapp_number);
create index tenants_plano_id_idx on iris.tenants (plano_id);
create index tenants_status_idx on iris.tenants (status) where deleted_at is null;

create trigger tenants_set_updated_at
  before update on iris.tenants
  for each row execute function iris_private.set_updated_at();

alter table iris.tenants enable row level security;
alter table iris.tenants force row level security;

-- tenants.id É o tenant — predicado usa id, não tenant_id (única tabela nesse caso).
create policy tenants_select_own on iris.tenants
  for select to authenticated
  using (id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy tenants_update_own on iris.tenants
  for update to authenticated
  using (id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));
-- INSERT/DELETE: sem policy — criação/cancelamento de tenant é admin-only (service_role).

grant select, update on iris.tenants to authenticated;

-- ── tenant_members (aditiva — insumo do Custom Access Token Hook) ──────────
create table iris.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'seat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, user_id)
);

-- Gap #1 do review inline (/supabase-postgres-best-practices): o Custom Access Token Hook
-- consulta por user_id em TODO mint de JWT (login/refresh) — hot path. unique(tenant_id, user_id)
-- lidera por tenant_id e não serve essa busca; índice dedicado em user_id é obrigatório.
create index tenant_members_user_id_idx on iris.tenant_members (user_id);
create index tenant_members_tenant_id_idx on iris.tenant_members (tenant_id);

create trigger tenant_members_set_updated_at
  before update on iris.tenant_members
  for each row execute function iris_private.set_updated_at();

alter table iris.tenant_members enable row level security;
alter table iris.tenant_members force row level security;

create policy tenant_members_select on iris.tenant_members
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

-- INSERT/DELETE só owner do próprio tenant (admin passa por service_role, fora de RLS).
create policy tenant_members_insert_owner on iris.tenant_members
  for insert to authenticated
  with check (
    tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid)
    and exists (
      select 1 from iris.tenant_members tm
      where tm.tenant_id = tenant_members.tenant_id
        and tm.user_id = (select auth.uid())
        and tm.role = 'owner'
        and tm.deleted_at is null
    )
  );

create policy tenant_members_update_owner on iris.tenant_members
  for update to authenticated
  using (
    tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid)
    and exists (
      select 1 from iris.tenant_members tm
      where tm.tenant_id = tenant_members.tenant_id
        and tm.user_id = (select auth.uid())
        and tm.role = 'owner'
        and tm.deleted_at is null
    )
  );

create policy tenant_members_delete_owner on iris.tenant_members
  for delete to authenticated
  using (
    tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid)
    and exists (
      select 1 from iris.tenant_members tm
      where tm.tenant_id = tenant_members.tenant_id
        and tm.user_id = (select auth.uid())
        and tm.role = 'owner'
        and tm.deleted_at is null
    )
  );

grant select, insert, update, delete on iris.tenant_members to authenticated;

-- ── whatsapp_connections (1:1 tenant — credenciais, ADR-018: RLS ON sem policy) ──
create table iris.whatsapp_connections (
  tenant_id uuid primary key references iris.tenants (id) on delete cascade,
  provider text not null check (provider in ('evolution', 'openwa', 'cloud_api')),
  instance_id text,
  credentials_ref text, -- referência ao Supabase Vault; nunca segredo em claro
  session_status text not null default 'desconectado'
    check (session_status in ('conectado', 'desconectado', 'pareando')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger whatsapp_connections_set_updated_at
  before update on iris.whatsapp_connections
  for each row execute function iris_private.set_updated_at();

alter table iris.whatsapp_connections enable row level security;
alter table iris.whatsapp_connections force row level security;
-- Sem policy nenhuma (ADR-018): só service_role (adapters no worker) lê/escreve.
