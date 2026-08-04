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

-- ponytail: iris_private.phone_hash/encrypt_pii são REVOKE'd de authenticated e GRANT'd só a
-- service_role (0001_extensions_pgcrypto_vault.sql — PII só cifra no backend, nunca client-side).
-- Testes 5-8 rodam como role authenticated (linha 18), então usam bytea literal no lugar da
-- chamada real — o que está sob teste aqui é RLS por tenant_id, não a criptografia em si.

-- 5. contacts INSERT: tenant A insere contact para o próprio tenant (RLS with check ok)
select lives_ok(
  format($$insert into iris.contacts (tenant_id, telefone_hash, telefone_enc, nome_enc)
           values (%L, '\x0001'::bytea, '\x0002'::bytea, '\x0003'::bytea)$$, :tenant_a),
  'tenant A consegue INSERT de contact com o próprio tenant_id'
);

-- ponytail: extensions.throws_ok(sql, code, desc) de 3 args despacha, quando octet_length(code)=5
-- (todo SQLSTATE tem 5 bytes), para throws_ok(sql, code, $3 AS MENSAGEM esperada, NULL AS desc) —
-- ou seja, o 3º argumento vira "mensagem exata esperada", não descrição do teste. Testes 6, 12, 13
-- usam a forma de 4 args (sql, code, null, description) pra comparar só o SQLSTATE.

-- 6. contacts INSERT: tenant A tenta inserir contact "fingindo" ser do tenant B → bloqueado
select throws_ok(
  format($$insert into iris.contacts (tenant_id, telefone_hash, telefone_enc, nome_enc)
           values (%L, '\x0004'::bytea, '\x0005'::bytea, '\x0006'::bytea)$$, :tenant_b),
  '42501',
  null,
  'tenant A NÃO consegue INSERT de contact com tenant_id de B (RLS with check)'
);

-- ponytail: Postgres exige que WITH com statement que modifica dados fique no nível
-- top-level da query — não pode ficar aninhado como subquery escalar dentro de select is(...)
-- ("WITH clause containing a data-modifying statement must be at the top level"). Testes 7-11
-- reescritos com o WITH no nível superior, só a leitura de `upd`/`del` vai dentro de is().

-- 7. contacts UPDATE: tenant A atualiza o próprio contact (1 linha afetada)
with upd as (
  update iris.contacts set nome_enc = '\x0007'::bytea
  where id = :contact_a1
  returning 1
)
select is(
  (select count(*)::int from upd),
  1,
  'tenant A consegue UPDATE do próprio contact'
);

-- 8. contacts UPDATE: tenant A tenta atualizar contact de B → 0 linhas (RLS using filtra fora do escopo)
with upd as (
  update iris.contacts set nome_enc = '\x0008'::bytea where id = :contact_b1
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'tenant A NÃO consegue UPDATE de contact do tenant B (0 linhas afetadas)'
);

-- 9. contacts DELETE: tenant A tenta apagar contact de B → 0 linhas
with del as (
  delete from iris.contacts where id = :contact_b1 returning 1
)
select is(
  (select count(*)::int from del),
  0,
  'tenant A NÃO consegue DELETE de contact do tenant B (0 linhas afetadas)'
);

-- 10. tenants UPDATE: tenant A atualiza o próprio tenant
with upd as (
  update iris.tenants set roteador_invisivel_ativo = true where id = :tenant_a returning 1
)
select is(
  (select count(*)::int from upd),
  1,
  'tenant A consegue UPDATE do próprio tenant'
);

-- 11. tenants UPDATE: tenant A tenta atualizar tenant B → 0 linhas
with upd as (
  update iris.tenants set status = 'cancelado' where id = :tenant_b returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'tenant A NÃO consegue UPDATE do tenant B (0 linhas afetadas)'
);

-- 12. tenants INSERT: sem policy de insert (admin-only via service_role) → bloqueado mesmo p/ o próprio "novo" tenant
select throws_ok(
  $$insert into iris.tenants (nome_empresa, plano_id, whatsapp_provider, whatsapp_number)
    values ('Tenant Fantasma', '00000000-0000-0000-0000-000000000101', 'evolution', '+5511900000099')$$,
  '42501',
  null,
  'authenticated NÃO consegue INSERT em iris.tenants (sem policy de insert, admin-only)'
);

-- 13. whatsapp_connections: ADR-018 (RLS ON, sem policy nenhuma) — SELECT bloqueado mesmo pro próprio tenant
select throws_ok(
  format($$select 1 from iris.whatsapp_connections where tenant_id = %L$$, :tenant_a),
  '42501',
  null,
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
