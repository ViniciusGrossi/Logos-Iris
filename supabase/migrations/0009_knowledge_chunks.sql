-- Logos Iris — 0009: knowledge_chunks (pgvector — UMA tabela com tenant_id + HNSW filtrado)
-- Trade-off aceito (ARCHITECTURE.md §1.4): HNSW faz pós-filtro por tenant, recall degrada se um tenant
-- tiver muito mais chunks que a média. Mitigação: hnsw.ef_search maior + iterative scan (app layer).
-- Upgrade path: particionar por hash(tenant_id) se um tenant gigante aparecer.

create table iris.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references iris.tenants (id) on delete cascade,
  source_type text not null check (source_type in ('tenant_knowledge', 'artisanal', 'contact_memory')),
  source_id uuid not null, -- FK polimórfica (knowledge_base_entries | artisanal_layer_versions | contact_memory_summaries conforme source_type)
  contact_id uuid references iris.contacts (id) on delete cascade,
  content_enc bytea, -- iris_private.encrypt_pii(content) — obrigatório só quando source_type='contact_memory'
  embedding public.vector(1536) not null, -- extensão vector já instalada no schema public nesta instância compartilhada
  created_at timestamptz not null default now()
);

create index kc_embedding_idx on iris.knowledge_chunks
  using hnsw (embedding public.vector_cosine_ops) with (m = 16, ef_construction = 64);
create index kc_tenant_idx on iris.knowledge_chunks (tenant_id);
create index kc_contact_idx on iris.knowledge_chunks (contact_id) where contact_id is not null;
-- Gap #2 do review inline (/supabase-postgres-best-practices): source_id é FK polimórfica sem índice —
-- toda invalidação/rollback de versão (knowledge_base_entries, artisanal_layer_versions, contact_memory_summaries)
-- precisa localizar chunks pelo source_id para deletar/reindexar.
create index kc_source_id_idx on iris.knowledge_chunks (source_id);

alter table iris.knowledge_chunks enable row level security;
alter table iris.knowledge_chunks force row level security;

create policy kc_select on iris.knowledge_chunks
  for select to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy kc_insert on iris.knowledge_chunks
  for insert to authenticated
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy kc_update on iris.knowledge_chunks
  for update to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid))
  with check (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

create policy kc_delete on iris.knowledge_chunks
  for delete to authenticated
  using (tenant_id = (select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid));

grant select, insert, update, delete on iris.knowledge_chunks to authenticated;
