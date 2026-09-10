-- Logos Iris — pgTAP: persona-atendimento — iris.memory_get_latest_summary (Story 2, docs/specs/persona-atendimento.md)
-- Cobre 2 propriedades que o Vitest (src/tests/persona-atendimento.test.ts, Fakes sem DB real) não
-- alcança: (a) a função SECURITY DEFINER é service-role-only (mesmo padrão ADR-018 de 0015/0018);
-- (b) o filtro `expira_em > now()` (SQL, migração 0020) realmente exclui resumo vencido e devolve
-- o resumo decriptado certo pro válido — regra que só se prova rodando contra o Postgres real.
-- Seed usado: supabase/seed.sql (contact c0002/tenant A = válido, c0001/tenant A = expirado,
-- c0004/tenant B = válido de outro tenant).

begin;
select plan(5);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set tenant_b '''00000000-0000-0000-0000-0000000000b1'''
\set contact_a_expirado '''00000000-0000-0000-0000-0000000c0001'''
\set contact_a_valido   '''00000000-0000-0000-0000-0000000c0002'''
\set contact_b_valido   '''00000000-0000-0000-0000-0000000c0004'''
\set contact_b_sem_memoria '''00000000-0000-0000-0000-0000000c0003'''

-- ── authenticated: função revoke'd (ADR-018) — nem o próprio tenant pode chamar direto ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_a))::text,
  true
);

select throws_ok(
  format($$select * from iris.memory_get_latest_summary(%L, %L)$$, :tenant_a, :contact_a_valido),
  '42501',
  null,
  'tenant A autenticado NÃO consegue chamar iris.memory_get_latest_summary (service-role-only)'
);

-- ── service_role: caminho real do Engine (ADR-018/031) ──
set local role service_role;

-- 2. resumo válido: devolve exatamente o resumo decriptado (Story 2, critério de aceite #2)
select is(
  (select resumo from iris.memory_get_latest_summary(:tenant_a::uuid, :contact_a_valido::uuid)),
  'Cliente já fez procedimento de limpeza de pele em maio; prefere atendimento à tarde.',
  'memory_get_latest_summary devolve o resumo decriptado do contato com resumo válido'
);

-- 3. resumo expirado: NÃO é devolvido — 0 linhas (LGPD/ADR-026, critério de aceite #4)
select is(
  (select count(*)::int from iris.memory_get_latest_summary(:tenant_a::uuid, :contact_a_expirado::uuid)),
  0,
  'memory_get_latest_summary NÃO devolve resumo expirado (expira_em <= now())'
);

-- 4. contato sem nenhum contact_memory_summaries: 0 linhas, não quebra (cliente novo, critério #3)
select is(
  (select count(*)::int from iris.memory_get_latest_summary(:tenant_b::uuid, :contact_b_sem_memoria::uuid)),
  0,
  'memory_get_latest_summary devolve 0 linhas pra contato sem contact_memory_summaries (cliente novo)'
);

-- 5. isolamento tenant: resumo válido de B nunca aparece se consultado com tenant_id de A
-- (mesmo contact_id não existindo em A, mas prova que o filtro é tenant_id AND contact_id, não só contact_id)
select is(
  (select count(*)::int from iris.memory_get_latest_summary(:tenant_a::uuid, :contact_b_valido::uuid)),
  0,
  'memory_get_latest_summary NÃO cruza tenant — contato de B não aparece consultado com tenant_id de A'
);

select * from finish();
rollback;
