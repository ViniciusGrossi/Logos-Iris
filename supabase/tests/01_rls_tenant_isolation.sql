-- Logos Iris — pgTAP: isolamento RLS tenant A vs tenant B
-- Roda sobre supabase/seed.sql (2 tenants fixos). Simula JWT via request.jwt.claims (mesmo
-- shape que o Custom Access Token Hook injeta: app_metadata.tenant_id) + set local role.
-- Padrão de leitura da regra travada: tenant_id = (select nullif(auth.jwt()->'app_metadata'->>'tenant_id','')::uuid)

begin;
select plan(14);

-- IDs fixos do seed.sql
-- tenant A = Studio Bella Estética · tenant B = Consultório Dr. Marcos Silva
\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set tenant_b '''00000000-0000-0000-0000-0000000000b1'''
\set owner_a  '''00000000-0000-0000-0000-0000000a0001'''
\set contact_a1 '''00000000-0000-0000-0000-0000000c0001'''
\set contact_b1 '''00000000-0000-0000-0000-0000000c0003'''

-- ── helper: assume identidade de tenant A (autenticado) ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :owner_a, 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_a))::text,
  true
);

-- 1. tenants: SELECT só enxerga o próprio tenant
select is(
  (select count(*)::int from iris.tenants),
  1,
  'tenant A via SELECT enxerga só 1 tenant (o próprio)'
);

-- 2. tenants: a linha visível é mesmo a de A, não a de B
select is(
  (select id::text from iris.tenants limit 1),
  :tenant_a,
  'tenant A não consegue ver a linha do tenant B em iris.tenants'
);

-- 3. contacts: SELECT só enxerga os 2 contacts do próprio tenant
select is(
  (select count(*)::int from iris.contacts),
  2,
  'tenant A via SELECT enxerga só os próprios 2 contacts'
);

-- 4. contacts: contact de B não aparece nem por id direto
select is(
  (select count(*)::int from iris.contacts where id = :contact_b1),
  0,
  'tenant A não enxerga contact_id do tenant B mesmo filtrando direto'
);

-- 5. contacts INSERT: tenant A insere contact para o próprio tenant (RLS with check ok)
select lives_ok(
  format($$insert into iris.contacts (tenant_id, telefone_hash, telefone_enc, nome_enc)
           values (%L, iris_private.phone_hash('+5511900000001'), iris_private.encrypt_pii('+5511900000001'), iris_private.encrypt_pii('Teste RLS'))$$, :tenant_a),
  'tenant A consegue INSERT de contact com o próprio tenant_id'
);

-- 6. contacts INSERT: tenant A tenta inserir contact "fingindo" ser do tenant B → bloqueado
select throws_ok(
  format($$insert into iris.contacts (tenant_id, telefone_hash, telefone_enc, nome_enc)
           values (%L, iris_private.phone_hash('+5511900000002'), iris_private.encrypt_pii('+5511900000002'), iris_private.encrypt_pii('Teste RLS B'))$$, :tenant_b),
  '42501',
  'tenant A NÃO consegue INSERT de contact com tenant_id de B (RLS with check)'
);

-- 7. contacts UPDATE: tenant A atualiza o próprio contact (1 linha afetada)
select is(
  (with upd as (
     update iris.contacts set nome_enc = iris_private.encrypt_pii('Camila Rocha Atualizada')
     where id = :contact_a1
     returning 1
   ) select count(*)::int from upd),
  1,
  'tenant A consegue UPDATE do próprio contact'
);

-- 8. contacts UPDATE: tenant A tenta atualizar contact de B → 0 linhas (RLS using filtra fora do escopo)
select is(
  (with upd as (
     update iris.contacts set nome_enc = iris_private.encrypt_pii('Hack') where id = :contact_b1
     returning 1
   ) select count(*)::int from upd),
  0,
  'tenant A NÃO consegue UPDATE de contact do tenant B (0 linhas afetadas)'
);

-- 9. contacts DELETE: tenant A tenta apagar contact de B → 0 linhas
select is(
  (with del as (
     delete from iris.contacts where id = :contact_b1 returning 1
   ) select count(*)::int from del),
  0,
  'tenant A NÃO consegue DELETE de contact do tenant B (0 linhas afetadas)'
);

-- 10. tenants UPDATE: tenant A atualiza o próprio tenant
select is(
  (with upd as (
     update iris.tenants set roteador_invisivel_ativo = true where id = :tenant_a returning 1
   ) select count(*)::int from upd),
  1,
  'tenant A consegue UPDATE do próprio tenant'
);

-- 11. tenants UPDATE: tenant A tenta atualizar tenant B → 0 linhas
select is(
  (with upd as (
     update iris.tenants set status = 'cancelado' where id = :tenant_b returning 1
   ) select count(*)::int from upd),
  0,
  'tenant A NÃO consegue UPDATE do tenant B (0 linhas afetadas)'
);

-- 12. tenants INSERT: sem policy de insert (admin-only via service_role) → bloqueado mesmo p/ o próprio "novo" tenant
select throws_ok(
  $$insert into iris.tenants (nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
    values ('Tenant Fantasma', '00000000-0000-0000-0000-000000000101', 'evolution', '+5511900000099')$$,
  '42501',
  'authenticated NÃO consegue INSERT em iris.tenants (sem policy de insert, admin-only)'
);

-- 13. whatsapp_connections: ADR-018 (RLS ON, sem policy nenhuma) — SELECT bloqueado mesmo pro próprio tenant
select throws_ok(
  format($$select 1 from iris.whatsapp_connections where tenant_id = %L$$, :tenant_a),
  '42501',
  'tenant A NÃO consegue SELECT em whatsapp_connections (ADR-018: service-role-only)'
);

-- ── troca para tenant B: confirma isolamento simétrico ──
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000b0001', 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_b))::text,
  true
);

-- 14. contacts: tenant B enxerga só os próprios 2 contacts (A ganhou um extra no passo 5, não vaza pra B)
select is(
  (select count(*)::int from iris.contacts),
  2,
  'tenant B via SELECT enxerga só os próprios 2 contacts (isolamento simétrico)'
);

select * from finish();
rollback;
