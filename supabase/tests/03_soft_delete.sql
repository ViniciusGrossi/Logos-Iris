-- Logos Iris — pgTAP: soft delete (product.schema.json cross_cutting: escopo = apenas tenants e contacts)
-- Roda como role padrão do runner (postgres/superuser, BYPASSRLS).

begin;
select plan(8);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set contact_a2 '''00000000-0000-0000-0000-0000000c0002'''

-- 1-2. coluna deleted_at existe nas 2 tabelas em escopo de soft delete
select has_column('iris', 'tenants', 'deleted_at', 'iris.tenants tem coluna deleted_at (soft delete)');
select has_column('iris', 'contacts', 'deleted_at', 'iris.contacts tem coluna deleted_at (soft delete)');

-- 3. soft-delete de um tenant (novo, descartável) não remove a linha fisicamente
insert into iris.tenants (nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
values ('Tenant Soft Delete', '00000000-0000-0000-0000-000000000101', 'evolution', '+5511900000699')
returning id as tenant_sd \gset

update iris.tenants set deleted_at = now() where id = :'tenant_sd';

select is(
  (select count(*)::int from iris.tenants where id = :'tenant_sd'),
  1,
  'soft delete de tenant (UPDATE deleted_at) não remove a linha fisicamente'
);

-- 4. índice parcial que sustenta consultas "só ativos" existe (tenants_status_idx where deleted_at is null)
select has_index('iris', 'tenants', 'tenants_status_idx', 'iris.tenants tem índice parcial para status ativo (deleted_at is null)');

-- 5. soft-delete de contact não remove a linha fisicamente
update iris.contacts set deleted_at = now() where id = :contact_a2;

select is(
  (select count(*)::int from iris.contacts where id = :contact_a2),
  1,
  'soft delete de contact (UPDATE deleted_at) não remove a linha fisicamente'
);

-- 6. contact soft-deletado some do padrão de consulta "ativos" (deleted_at is null)
select is(
  (select count(*)::int from iris.contacts where id = :contact_a2 and deleted_at is null),
  0,
  'contact soft-deletado é excluído do filtro deleted_at is null usado pela app'
);

-- 7. desvio documentado: tenant_members também ganhou deleted_at (fora do escopo do product.schema.json,
-- mas coerente com o padrão de convite/remoção de seat sem apagar histórico) — registrado, não é falha.
select has_column('iris', 'tenant_members', 'deleted_at', 'iris.tenant_members também tem deleted_at (DESVIO vs. product.schema.json — ver relatório)');

-- 8. fora do escopo: conversations NÃO tem soft delete (spec restringe a tenants + contacts)
select hasnt_column('iris', 'conversations', 'deleted_at', 'iris.conversations NÃO tem deleted_at (fora do escopo de soft delete)');

select * from finish();
rollback;
