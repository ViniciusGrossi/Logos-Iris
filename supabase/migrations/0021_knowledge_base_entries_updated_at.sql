-- Logos Iris — 0020: iris.knowledge_base_entries.updated_at (feature knowledge-base-v1)
-- Tabela criada em 0008 sem updated_at. O backend desta feature faz UPDATE em linha existente
-- (múltiplos PUT no mesmo campo antes de publicar reaproveitam o rascunho aberto; publish/rollback
-- trocam status de linhas existentes) — todo campo mutável do projeto tem trigger set_updated_at
-- (padrão 0002/0003/0004/0005/0010/0014). Sem deleted_at aqui: convenção do projeto (comentário em
-- 0004) é soft delete só em tenants/contacts; entries são catálogo versionado, nunca deletadas
-- fisicamente — 'historico' já é o "delete" lógico de uma versão.

alter table iris.knowledge_base_entries
  add column updated_at timestamptz not null default now();

create trigger knowledge_base_entries_set_updated_at
  before update on iris.knowledge_base_entries
  for each row execute function iris_private.set_updated_at();
