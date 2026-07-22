-- Logos Iris — 0004: model_registry + model_circuit_state (ModelGateway, entidade global)
-- Sem tenant_id, sem PII. Criada antes de messages/model_usage_log pois ambas referenciam model_registry.id.
-- cross_cutting.soft_delete (product.schema.json): deleted_at só em tenants/contacts — demais tabelas
-- são catálogo/log, sem soft delete (desativação via `ativo=false`, não delete).

create table iris.model_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('glm', 'kimi', 'deepseek', 'minimax', 'nvidia_nim', 'claude', 'gpt4o', 'groq')),
  model_name text not null,
  task_type text not null check (task_type in ('triagem', 'conversa_principal', 'extracao_documento', 'embeddings')),
  tier text not null check (tier in ('basico', 'premium')),
  prioridade_fallback integer not null,
  ativo boolean not null default true,
  custo_por_1k_tokens_input numeric(10, 6) not null,
  custo_por_1k_tokens_output numeric(10, 6) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_type, tier, prioridade_fallback)
);

create index model_registry_active_route_idx on iris.model_registry (task_type, tier) where ativo;

create trigger model_registry_set_updated_at
  before update on iris.model_registry
  for each row execute function iris_private.set_updated_at();

alter table iris.model_registry enable row level security;
alter table iris.model_registry force row level security;
-- admin-only (hardcoded no Service layer) — sem policy, service_role bypassa. Sem SELECT p/ painel cliente.

-- ── model_circuit_state — estado do breaker em tabela (Edge é frio; sem Redis) ──
create table iris.model_circuit_state (
  model_id uuid primary key references iris.model_registry (id) on delete cascade,
  state text not null default 'closed' check (state in ('closed', 'open', 'half_open')),
  failure_count integer not null default 0,
  opened_at timestamptz,
  half_open_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger model_circuit_state_set_updated_at
  before update on iris.model_circuit_state
  for each row execute function iris_private.set_updated_at();

alter table iris.model_circuit_state enable row level security;
alter table iris.model_circuit_state force row level security;
-- ADR-018: RLS ON sem policy — service-role-only.
