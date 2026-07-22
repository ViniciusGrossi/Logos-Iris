-- Logos Iris — 0010: appointments, follow_ups
-- Tool "propor horário" / "criar follow-up" da ConversationEngine (módulo 5). Sem PII adicional
-- (contact_id/conversation_id já carregam a referência; dados de PII ficam em contacts).

create table iris.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  contact_id uuid not null references iris.contacts (id) on delete cascade,
  conversation_id uuid not null references iris.conversations (id) on delete cascade,
  horario timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'remarcado', 'no_show', 'cancelado', 'concluido')),
  confirmacao_enviada_em timestamptz, -- confirmação automática na véspera
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_tenant_horario_idx on iris.appointments (tenant_id, horario);
create index appointments_contact_id_idx on iris.appointments (contact_id);
create index appointments_conversation_id_idx on iris.appointments (conversation_id);
create index appointments_active_horario_idx on iris.appointments (horario)
  where status in ('agendado', 'confirmado');

create trigger appointments_set_updated_at
  before update on iris.appointments
  for each row execute function iris_private.set_updated_at();

alter table iris.appointments enable row level security;
alter table iris.appointments force row level security;

create policy appointments_select on iris.appointments
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy appointments_insert on iris.appointments
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy appointments_update on iris.appointments
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy appointments_delete on iris.appointments
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.appointments to authenticated;

-- ── follow_ups (Story 8 — retomada de lead que sumiu, uma vez) ──
create table iris.follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  conversation_id uuid not null references iris.conversations (id) on delete cascade,
  agendado_para timestamptz not null, -- retomada em 48h, uma vez (decisão do brainstorm)
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'cancelado')),
  created_at timestamptz not null default now()
);

create index follow_ups_pendente_idx on iris.follow_ups (agendado_para) where status = 'pendente';
create index follow_ups_tenant_created_idx on iris.follow_ups (tenant_id, created_at);
create index follow_ups_conversation_id_idx on iris.follow_ups (conversation_id);

alter table iris.follow_ups enable row level security;
alter table iris.follow_ups force row level security;

create policy follow_ups_select on iris.follow_ups
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy follow_ups_insert on iris.follow_ups
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy follow_ups_update on iris.follow_ups
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy follow_ups_delete on iris.follow_ups
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.follow_ups to authenticated;
