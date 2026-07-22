-- Logos Iris — 0011: conversation_signals (aditiva — ARCHITECTURE.md §1.3)
-- Gap descoberto na Fase 3: GetDailySummary.orcamentos_gerados e leads_quentes não tinham backing.
-- Emitido pela ConversationEngineService como subproduto do processamento (não editável pelo painel) —
-- mesmo padrão de conversation_state (0005): SELECT para o próprio tenant, escrita só via service_role.

create table iris.conversation_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  conversation_id uuid not null references iris.conversations (id) on delete cascade,
  tipo text not null check (tipo in ('orcamento', 'lead_quente', 'intencao_agendamento')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index conversation_signals_tenant_created_idx on iris.conversation_signals (tenant_id, created_at);
create index conversation_signals_conversation_id_idx on iris.conversation_signals (conversation_id);

alter table iris.conversation_signals enable row level security;
alter table iris.conversation_signals force row level security;

create policy conversation_signals_select on iris.conversation_signals
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select on iris.conversation_signals to authenticated;
-- INSERT/UPDATE/DELETE: sem policy — a engine (service_role) é a única emissora do sinal.
