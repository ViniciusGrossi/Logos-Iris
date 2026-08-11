-- Logos Iris — 0018: message-debouncer flush (módulo 3, docs/specs/message-debouncer.md)
-- Aditivo puro sobre 0005 (conversation_state) + 0016 (tenant-router-queue agenda o debounce).
-- Nenhuma tabela nova. Uma função SECURITY DEFINER que varre conversation_state com
-- debounce_until vencido e retorna os message_ids acumulados para o Engine processar.
-- Acionada por pg_cron a cada 10s (ADR-031) via Edge Function debouncer-flush-worker.

-- ── iris.debouncer_flush_due — varre conversas com debounce vencido ──
-- Retorna jsonb: [{ conversation_id, message_ids }] — message_ids são os provider_message_id
-- das mensagens recebidas desde o último flush (ou desde o início do buffer).
-- O índice parcial conversation_state_debounce_idx (0005) garante que a varredura só toca
-- linhas com debounce_until IS NOT NULL (CA#5).
create or replace function iris.debouncer_flush_due()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'conversation_id', cs.conversation_id,
        'message_ids', (
          select coalesce(jsonb_agg(m.provider_message_id order by m.created_at), '[]'::jsonb)
          from iris.messages m
          where m.conversation_id = cs.conversation_id
            and m.direcao = 'recebida'
            and m.created_at >= (
              -- janela: mensagens desde o início do buffer (debounce_until - 8s)
              cs.debounce_until - make_interval(secs => 8)
            )
        )
      )
      order by cs.debounce_until
    ),
    '[]'::jsonb
  )
  from iris.conversation_state cs
  where cs.debounce_until is not null
    and cs.debounce_until <= now();
$$;

revoke execute on function iris.debouncer_flush_due() from public, anon, authenticated;
grant execute on function iris.debouncer_flush_due() to service_role;

-- ── iris.debouncer_clear — limpa debounce_until após flush (CA#4) ──
-- Seta debounce_until = null para que a conversa saia do índice parcial.
-- Só service_role (chamado pelo worker após processar o flush).
create or replace function iris.debouncer_clear(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update iris.conversation_state
     set debounce_until = null
   where conversation_id = p_conversation_id;
$$;

revoke execute on function iris.debouncer_clear(uuid) from public, anon, authenticated;
grant execute on function iris.debouncer_clear(uuid) to service_role;