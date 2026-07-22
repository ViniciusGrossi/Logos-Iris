-- Logos Iris — 0005: conversations, conversation_state, handoff_events

create table iris.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  contact_id uuid not null references iris.contacts (id) on delete cascade,
  persona_ativa text not null check (persona_ativa in ('atendimento', 'vendas', 'agendamento', 'sdr')),
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'encerrada')),
  pausada_ate timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_tenant_status_idx on iris.conversations (tenant_id, status) where status = 'ativa';
create index conversations_contact_id_idx on iris.conversations (contact_id);
create index conversations_tenant_updated_idx on iris.conversations (tenant_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on iris.conversations
  for each row execute function iris_private.set_updated_at();

alter table iris.conversations enable row level security;
alter table iris.conversations force row level security;

create policy conversations_select on iris.conversations
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy conversations_insert on iris.conversations
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy conversations_update on iris.conversations
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy conversations_delete on iris.conversations
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.conversations to authenticated;

-- ── conversation_state (aditiva — horizonte curto, 1:1 com conversa, expira) ──
create table iris.conversation_state (
  conversation_id uuid primary key references iris.conversations (id) on delete cascade,
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  debounce_until timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index conversation_state_debounce_idx on iris.conversation_state (debounce_until) where debounce_until is not null;
create index conversation_state_expires_idx on iris.conversation_state (expires_at);

create trigger conversation_state_set_updated_at
  before update on iris.conversation_state
  for each row execute function iris_private.set_updated_at();

alter table iris.conversation_state enable row level security;
alter table iris.conversation_state force row level security;

-- ARCHITECTURE.md §1.3: "RLS: tenant_id=claim (leitura), escrita service-role." — só SELECT p/ authenticated,
-- escrita (debounce/slots/pending_tool) é máquina de estado interna da engine, nunca editável pelo painel.
create policy conversation_state_select on iris.conversation_state
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select on iris.conversation_state to authenticated;

-- ── handoff_events (schema + aditivo tenant_id denormalizado — evita join no RLS) ──
create table iris.handoff_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  conversation_id uuid not null references iris.conversations (id) on delete cascade,
  gatilho text not null check (gatilho in ('botao_painel', 'from_me_detectado', 'comando_chat', 'pedido_cliente', 'baixa_confianca')),
  acionado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  retomada_confirmada boolean not null default false -- retomada após pausa longa nunca é silenciosa
);

create index handoff_events_conversation_acionado_idx on iris.handoff_events (conversation_id, acionado_em desc);
create index handoff_events_tenant_id_idx on iris.handoff_events (tenant_id);

alter table iris.handoff_events enable row level security;
alter table iris.handoff_events force row level security;

create policy handoff_events_select on iris.handoff_events
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy handoff_events_insert on iris.handoff_events
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy handoff_events_update on iris.handoff_events
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy handoff_events_delete on iris.handoff_events
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.handoff_events to authenticated;
