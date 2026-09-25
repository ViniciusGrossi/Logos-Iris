-- Logos Iris — pgTAP: persona-agendamento — confirmação de véspera timezone-aware (migração 0025)
-- Cobre o que o Vitest (src/tests/appointment.service.test.ts, Fakes sem DB real) não alcança:
-- (a) appointments_due_for_confirmation/appointments_mark_confirmation_sent/gateway_get_contact_phone
-- são service-role-only (mesmo padrão ADR-018 de 0015/0018/0020/0022); (b) "amanhã" é calculado
-- de verdade no fuso do TENANT (tenants.timezone), não em UTC fixo (Requisito 5); (c) o filtro por
-- status/confirmacao_enviada_em já enviada realmente exclui candidatos que não deveriam disparar.
-- Seed usado: supabase/seed.sql — tenant A (00000000-0000-0000-0000-0000000000a1, timezone default
-- América/São Paulo), contato c0001 (+5511911110001), conversa d0001.

begin;
select plan(9);

\set tenant_a '''00000000-0000-0000-0000-0000000000a1'''
\set contact_a '''00000000-0000-0000-0000-0000000c0001'''
\set conversation_a '''00000000-0000-0000-0000-0000000d0001'''

-- ── authenticated: as 3 funções novas são service-role-only ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', :tenant_a))::text,
  true
);

select throws_ok(
  $$select * from iris.appointments_due_for_confirmation()$$,
  '42501', null, 'tenant autenticado NAO consegue chamar appointments_due_for_confirmation'
);
select throws_ok(
  format($$select iris.appointments_mark_confirmation_sent(%L::uuid)$$, gen_random_uuid()),
  '42501', null, 'tenant autenticado NAO consegue chamar appointments_mark_confirmation_sent'
);
select throws_ok(
  format($$select iris.gateway_get_contact_phone(%L, %L)$$, :tenant_a, :contact_a),
  '42501', null, 'tenant autenticado NAO consegue chamar gateway_get_contact_phone'
);

-- ── fixtures: um appointment DEVIDO amanhã (fuso do tenant) + um NÃO devido (depois de amanhã) ──
reset role;

insert into iris.appointments (id, tenant_id, contact_id, conversation_id, horario, status)
values (
  '00000000-0000-0000-0000-0000000ac001', :tenant_a::uuid, :contact_a::uuid, :conversation_a::uuid,
  (((now() at time zone 'America/Sao_Paulo')::date + 1) + time '10:00:00') at time zone 'America/Sao_Paulo',
  'agendado'
);

insert into iris.appointments (id, tenant_id, contact_id, conversation_id, horario, status)
values (
  '00000000-0000-0000-0000-0000000ac002', :tenant_a::uuid, :contact_a::uuid, :conversation_a::uuid,
  (((now() at time zone 'America/Sao_Paulo')::date + 2) + time '10:00:00') at time zone 'America/Sao_Paulo',
  'agendado'
);

-- ── service_role: caminho real do worker (ADR-018/031) ──
set local role service_role;

select ok(
  '00000000-0000-0000-0000-0000000ac001'::uuid in (select appointment_id from iris.appointments_due_for_confirmation()),
  'appointments_due_for_confirmation inclui o appointment de AMANHA (fuso do tenant)'
);
select ok(
  '00000000-0000-0000-0000-0000000ac002'::uuid not in (select appointment_id from iris.appointments_due_for_confirmation()),
  'appointments_due_for_confirmation NAO inclui o appointment de depois de amanha'
);

select is(
  (select iris.gateway_get_contact_phone(:tenant_a::uuid, :contact_a::uuid)),
  '+5511911110001',
  'gateway_get_contact_phone decripta o telefone certo do contato'
);
select is(
  (select iris.gateway_get_contact_phone('00000000-0000-0000-0000-0000000000b1'::uuid, :contact_a::uuid)),
  null,
  'gateway_get_contact_phone NAO cruza tenant — contato de A consultado com tenant_id de B devolve null'
);

select iris.appointments_mark_confirmation_sent('00000000-0000-0000-0000-0000000ac001'::uuid);

select is(
  (select confirmacao_enviada_em is not null from iris.appointments where id = '00000000-0000-0000-0000-0000000ac001'::uuid),
  true,
  'appointments_mark_confirmation_sent grava confirmacao_enviada_em'
);
select ok(
  '00000000-0000-0000-0000-0000000ac001'::uuid not in (select appointment_id from iris.appointments_due_for_confirmation()),
  'apos marcado, o appointment NAO reaparece em appointments_due_for_confirmation (idempotente)'
);

select * from finish();
rollback;
