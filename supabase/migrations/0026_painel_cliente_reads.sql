-- Logos Iris — 0026: painel-cliente-v1 (docs/specs/painel-cliente-v1.md) — wrappers de leitura
-- SECURITY DEFINER pro Inbox real (ListConversations/GetConversationMessages) e Dashboard real
-- (GetDailySummary). Nenhuma tabela nova (Restrições Técnicas da spec) — conversations/messages/
-- contacts já existem, conversation_signals (0011) já cobre orcamentos_gerados/leads_quentes,
-- appointments (0010) cobre agendamentos_criados. Mesmo padrão de decrypt via iris_private
-- (0015/0020/0022): nunca decripta client-side, sempre por um wrapper que expõe só o formato final.

-- ── iris.conversations_list — Inbox: paginado, filtro status/persona, contato decriptado ──
create or replace function iris.conversations_list(
  p_tenant_id uuid,
  p_status text default null,
  p_persona text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  contact_nome text,
  contact_telefone text,
  persona_ativa text,
  status text,
  pausada_ate timestamptz,
  ultima_mensagem_preview text,
  ultima_mensagem_em timestamptz,
  total bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    c.id,
    iris_private.decrypt_pii(ct.nome_enc) as contact_nome,
    iris_private.decrypt_pii(ct.telefone_enc) as contact_telefone,
    c.persona_ativa,
    c.status,
    c.pausada_ate,
    lm.conteudo as ultima_mensagem_preview,
    lm.created_at as ultima_mensagem_em,
    count(*) over() as total
  from iris.conversations c
  join iris.contacts ct on ct.id = c.contact_id
  left join lateral (
    select iris_private.decrypt_pii(m.conteudo_enc) as conteudo, m.created_at
    from iris.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.tenant_id = p_tenant_id
    and (p_status is null or c.status = p_status)
    and (p_persona is null or c.persona_ativa = p_persona)
  order by coalesce(lm.created_at, c.updated_at) desc
  limit p_limit offset p_offset;
$$;

revoke execute on function iris.conversations_list(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function iris.conversations_list(uuid, text, text, int, int) to service_role;

-- ── iris.conversation_messages_list — histórico paginado de 1 conversa, decriptado ──
create or replace function iris.conversation_messages_list(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  direcao text,
  conteudo text,
  tipo_midia text,
  created_at timestamptz,
  total bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    m.id,
    m.direcao,
    iris_private.decrypt_pii(m.conteudo_enc) as conteudo,
    m.tipo_midia,
    m.created_at,
    count(*) over() as total
  from iris.messages m
  join iris.conversations c on c.id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and m.tenant_id = p_tenant_id
    and c.tenant_id = p_tenant_id -- defesa em profundidade (nunca confia só no filtro de messages)
  order by m.created_at asc
  limit p_limit offset p_offset;
$$;

revoke execute on function iris.conversation_messages_list(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function iris.conversation_messages_list(uuid, uuid, int, int) to service_role;

-- ── iris.dashboard_summary — GetDailySummary, 4 campos exatos do contrato ──
-- total_conversas: conversas com atividade (updated_at) no dia. orcamentos_gerados/leads_quentes:
-- iris.conversation_signals (0011, emitido pela engine — hoje sem caller vivo, mesma situação já
-- aceita em outras specs, retorna vazio até a engine emitir sinais de verdade).
-- agendamentos_criados: iris.appointments criados no dia (persona-agendamento, 0010).
create or replace function iris.dashboard_summary(p_tenant_id uuid, p_data date)
returns table (
  total_conversas int,
  orcamentos_gerados int,
  agendamentos_criados int,
  leads_quentes jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    (select count(*)::int from iris.conversations c where c.tenant_id = p_tenant_id and c.updated_at::date = p_data),
    (select count(*)::int from iris.conversation_signals s where s.tenant_id = p_tenant_id and s.tipo = 'orcamento' and s.created_at::date = p_data),
    (select count(*)::int from iris.appointments a where a.tenant_id = p_tenant_id and a.created_at::date = p_data),
    (select coalesce(jsonb_agg(jsonb_build_object('conversation_id', s.conversation_id, 'resumo', s.payload ->> 'resumo') order by s.created_at desc), '[]'::jsonb)
       from iris.conversation_signals s where s.tenant_id = p_tenant_id and s.tipo = 'lead_quente' and s.created_at::date = p_data);
$$;

revoke execute on function iris.dashboard_summary(uuid, date) from public, anon, authenticated;
grant execute on function iris.dashboard_summary(uuid, date) to service_role;
