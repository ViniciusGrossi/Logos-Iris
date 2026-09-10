-- Logos Iris — seed de desenvolvimento
-- 2 tenants completos (persona diferente cada) cobrindo toda a cadeia: plans -> tenants -> tenant_members
-- -> whatsapp_connections -> contacts (pgcrypto) -> conversations -> messages -> knowledge -> appointments/follow_ups.
-- IDs fixos e legíveis para os testes pgTAP em supabase/tests/ referenciarem sem re-consultar.
-- Roda como owner da migration (postgres) — tem EXECUTE nas funções iris_private mesmo com REVOKE de anon/authenticated.

-- ── auth.users (dev-only — login de teste local, nunca usar em produção) ──
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated',
   'owner@bellaestetica.dev', crypt('dev-password-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nome":"Ana Bella"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000b0001', 'authenticated', 'authenticated',
   'owner@consultoriomarcos.dev', crypt('dev-password-123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nome":"Marcos Silva"}', now(), now())
on conflict (id) do nothing;

-- ── plans ──
insert into iris.plans (
  id, nome, max_personas_ativas, roteador_invisivel_incluso, tier_modelo, limite_mensagens_mes,
  retencao_memoria_dias, follow_ups_automaticos_mes, auditoria_qualidade_incluida, seats_painel,
  api_oficial_meta_addon_disponivel, voz_clonada_addon_disponivel
) values
  ('00000000-0000-0000-0000-000000000101', 'Básico', 1, false, 'basico', 1000, 90, 20, false, 1, false, false),
  ('00000000-0000-0000-0000-000000000102', 'Premium', 4, true, 'premium', 10000, 180, 100, true, 5, true, true)
on conflict (id) do nothing;

-- ── tenants ──
insert into iris.tenants (
  id, nome_empresa, plano_id, status, whatsapp_provider, whatsapp_number,
  whatsapp_connection_status, personas_ativas, roteador_invisivel_ativo, timezone
) values
  ('00000000-0000-0000-0000-0000000000a1', 'Studio Bella Estética', '00000000-0000-0000-0000-000000000101',
   'ativo', 'evolution', '+5511987650001', 'conectado', array['atendimento', 'agendamento'], false, 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-0000000000b1', 'Consultório Dr. Marcos Silva', '00000000-0000-0000-0000-000000000102',
   'ativo', 'cloud_api', '+5511987650002', 'conectado', array['atendimento', 'agendamento', 'sdr'], true, 'America/Sao_Paulo')
on conflict (id) do nothing;

-- ── tenant_members ──
insert into iris.tenant_members (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000a0001', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000b0001', 'owner')
on conflict (tenant_id, user_id) do nothing;

-- ── whatsapp_connections (1:1, service-role-only) ──
insert into iris.whatsapp_connections (tenant_id, provider, instance_id, credentials_ref, session_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'evolution', 'bella-estetica-01', 'vault:iris/bella-estetica/evolution', 'conectado'),
  ('00000000-0000-0000-0000-0000000000b1', 'cloud_api', 'consultorio-marcos-01', 'vault:iris/consultorio-marcos/cloud_api', 'conectado')
on conflict (tenant_id) do nothing;

-- ── contacts (PII cifrada — iris_private.encrypt_pii/phone_hash de 0001) ──
insert into iris.contacts (id, tenant_id, telefone_hash, telefone_enc, nome_enc) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000a1',
   iris_private.phone_hash('+5511911110001'), iris_private.encrypt_pii('+5511911110001'), iris_private.encrypt_pii('Camila Rocha')),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000a1',
   iris_private.phone_hash('+5511911110002'), iris_private.encrypt_pii('+5511911110002'), iris_private.encrypt_pii('Bruno Tanaka')),
  ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000000b1',
   iris_private.phone_hash('+5511922220001'), iris_private.encrypt_pii('+5511922220001'), iris_private.encrypt_pii('Fernanda Lima')),
  ('00000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-0000000000b1',
   iris_private.phone_hash('+5511922220002'), iris_private.encrypt_pii('+5511922220002'), iris_private.encrypt_pii('Ricardo Souza'))
on conflict (id) do nothing;

-- ── conversations ──
insert into iris.conversations (id, tenant_id, contact_id, persona_ativa, status) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000c0001', 'agendamento', 'ativa'),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000c0002', 'atendimento', 'encerrada'),
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000c0003', 'sdr', 'ativa'),
  ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000c0004', 'agendamento', 'pausada')
on conflict (id) do nothing;

insert into iris.conversation_state (conversation_id, tenant_id, state, expires_at) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000a1', '{"intent":"agendar_horario"}'::jsonb, now() + interval '24 hours'),
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000000b1', '{"intent":"qualificar_lead"}'::jsonb, now() + interval '24 hours')
on conflict (conversation_id) do nothing;

-- ── model_registry (ModelGateway — global) ──
insert into iris.model_registry (id, provider, model_name, task_type, tier, prioridade_fallback, ativo, custo_por_1k_tokens_input, custo_por_1k_tokens_output) values
  ('00000000-0000-0000-0000-0000000e0001', 'glm', 'glm-4-flash', 'triagem', 'basico', 1, true, 0.000100, 0.000100),
  ('00000000-0000-0000-0000-0000000e0002', 'groq', 'llama-3.1-8b-instant', 'triagem', 'basico', 2, true, 0.000050, 0.000080),
  ('00000000-0000-0000-0000-0000000e0003', 'kimi', 'kimi-k2', 'conversa_principal', 'basico', 1, true, 0.001200, 0.001200),
  ('00000000-0000-0000-0000-0000000e0004', 'claude', 'claude-haiku-4', 'conversa_principal', 'premium', 1, true, 0.003000, 0.015000),
  ('00000000-0000-0000-0000-0000000e0005', 'gpt4o', 'gpt-4o', 'conversa_principal', 'premium', 2, true, 0.005000, 0.015000)
on conflict (id) do nothing;

insert into iris.model_circuit_state (model_id, state) values
  ('00000000-0000-0000-0000-0000000e0001', 'closed'),
  ('00000000-0000-0000-0000-0000000e0002', 'closed'),
  ('00000000-0000-0000-0000-0000000e0003', 'closed'),
  ('00000000-0000-0000-0000-0000000e0004', 'closed'),
  ('00000000-0000-0000-0000-0000000e0005', 'closed')
on conflict (model_id) do nothing;

-- ── messages (partição do mês corrente, pré-criada em 0006/0012) ──
insert into iris.messages (tenant_id, conversation_id, provider_message_id, conteudo_enc, direcao, tipo_midia, model_id, tokens_input, tokens_output, custo_usd, latencia_ms) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0001', 'evo-msg-0001',
   iris_private.encrypt_pii('Oi, queria marcar um horário pra sexta'), 'recebida', 'texto', null, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0001', null,
   iris_private.encrypt_pii('Claro! Temos horário às 14h ou 16h na sexta, qual prefere?'), 'enviada', 'texto',
   '00000000-0000-0000-0000-0000000e0004', 120, 45, 0.001035, 850),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000d0003', 'cloud-msg-0001',
   iris_private.encrypt_pii('Vi o anúncio de vocês, quero saber mais sobre a consulta'), 'recebida', 'texto', null, null, null, null, null);

-- ── contact_memory_summaries ──
-- c0002 (tenant A): resumo válido (expira_em no futuro) — caso feliz de persona-atendimento Story 2.
-- c0001 (tenant A): resumo EXPIRADO (adicionado p/ persona-atendimento, ver 0020/supabase/tests/06) —
-- prova que iris.memory_get_latest_summary nunca devolve resumo vencido (LGPD/ADR-026).
-- c0004 (tenant B): resumo válido de outro tenant — usado no teste de isolamento RLS (06).
insert into iris.contact_memory_summaries (contact_id, tenant_id, resumo_enc, periodo_inicio, periodo_fim, expira_em) values
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000a1',
   iris_private.encrypt_pii('Cliente já fez procedimento de limpeza de pele em maio; prefere atendimento à tarde.'),
   now() - interval '30 days', now() - interval '1 day', now() + interval '89 days'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000a1',
   iris_private.encrypt_pii('Resumo antigo, já vencido — não deve mais ser injetado no contexto.'),
   now() - interval '120 days', now() - interval '91 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-0000000000b1',
   iris_private.encrypt_pii('Paciente prefere confirmação de consulta por WhatsApp na véspera.'),
   now() - interval '10 days', now() - interval '1 day', now() + interval '80 days');

-- ── knowledge_base_entries + artisanal_layer_versions ──
insert into iris.knowledge_base_entries (tenant_id, campo, conteudo, status, versao, publicado_em) values
  ('00000000-0000-0000-0000-0000000000a1', 'horarios', '{"seg_sex": "09:00-19:00", "sab": "09:00-13:00"}'::jsonb, 'publicado', 1, now()),
  ('00000000-0000-0000-0000-0000000000a1', 'catalogo', '{"servicos": ["limpeza de pele", "massagem relaxante"]}'::jsonb, 'rascunho', 2, null),
  ('00000000-0000-0000-0000-0000000000b1', 'faq', '{"perguntas": [{"q": "aceita convênio?", "a": "sim, consulte a lista no site"}]}'::jsonb, 'publicado', 1, now());

insert into iris.artisanal_layer_versions (tenant_id, conteudo, status, versao, publicado_em) values
  ('00000000-0000-0000-0000-0000000000a1', 'Tom acolhedor, sempre sugerir o combo limpeza+massagem quando o cliente perguntar preço.', 'publicado', 1, now()),
  ('00000000-0000-0000-0000-0000000000b1', 'Tom formal, nunca prometer diagnóstico por WhatsApp — sempre direcionar para consulta presencial.', 'publicado', 1, now());

-- ── appointments + follow_ups + conversation_signals ──
insert into iris.appointments (tenant_id, contact_id, conversation_id, horario, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000d0001',
   date_trunc('day', now()) + interval '2 days' + interval '14 hours', 'agendado');

insert into iris.follow_ups (tenant_id, conversation_id, agendado_para, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000d0004', now() + interval '48 hours', 'pendente');

insert into iris.conversation_signals (tenant_id, conversation_id, tipo, payload) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000d0003', 'lead_quente', '{"score": 0.82, "motivo": "pediu preço de consulta particular"}'::jsonb);

-- ── model_usage_log ──
insert into iris.model_usage_log (tenant_id, conversation_id, model_id, tokens_input, tokens_output, custo_usd, latencia_ms, escalonou_para_humano) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0004', 120, 45, 0.001035, 850, false);
