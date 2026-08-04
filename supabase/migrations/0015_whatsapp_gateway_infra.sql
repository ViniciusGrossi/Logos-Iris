-- Logos Iris — 0015: infra mínima do whatsapp-gateway (spec docs/specs/whatsapp-gateway.md)
-- webhook_inbox e whatsapp_connections já existem (0002, 0006) — nenhuma tabela nova aqui.
--
-- Duas necessidades de infra descobertas no build (DESVIO, ver relatório do worker):
-- 1. pgmq não estava instalado (Requisito 5: "tudo pesado vai para pgmq"). Habilita + cria a
--    fila usada pelo Gateway (producer). Consumo é do módulo 2 (tenant-router-queue.md).
-- 2. `iris_private` NÃO está em `schemas` (supabase/config.toml) — só `public`, `graphql_public`,
--    `iris`. O client service_role do Next.js fala PostgREST, que não alcança schema não exposto
--    mesmo bypassando RLS. Duas funções wrapper SECURITY DEFINER em `iris` (schema exposto)
--    encapsulam o acesso a `iris_private.phone_hash` e a `pgmq.send`, sem expor `iris_private`
--    nem `pgmq` inteiros — só a operação pontual que o Gateway precisa, grant só a service_role.

create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'whatsapp_inbound'
  ) then
    perform pgmq.create('whatsapp_inbound');
  end if;
end;
$$;

-- ── iris.gateway_find_contact_id — lookup determinístico de contact por telefone ──
-- Usado só pelo fluxo from_me_detectado (Requisito 4) pra achar a conversa a pausar.
-- Não decripta nada, não expõe iris_private — só devolve o id (ou null).
create or replace function iris.gateway_find_contact_id(p_tenant_id uuid, p_telefone text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from iris.contacts
  where tenant_id = p_tenant_id
    and telefone_hash = iris_private.phone_hash(p_telefone)
    and deleted_at is null
  limit 1;
$$;

revoke execute on function iris.gateway_find_contact_id(uuid, text) from public, anon, authenticated;
grant execute on function iris.gateway_find_contact_id(uuid, text) to service_role;

-- ── iris.gateway_enqueue_whatsapp_message — envia pro pgmq sem expor o schema pgmq inteiro ──
create or replace function iris.gateway_enqueue_whatsapp_message(p_payload jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select * from pgmq.send('whatsapp_inbound', p_payload);
$$;

revoke execute on function iris.gateway_enqueue_whatsapp_message(jsonb) from public, anon, authenticated;
grant execute on function iris.gateway_enqueue_whatsapp_message(jsonb) to service_role;
