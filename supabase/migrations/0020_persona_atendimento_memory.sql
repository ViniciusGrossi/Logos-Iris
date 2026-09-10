-- Logos Iris — 0020: persona-atendimento — leitura de contact_memory_summaries (Story 2, docs/specs/persona-atendimento.md)
-- Nenhuma tabela nova: contact_memory_summaries já existe (0007) + updated_at (0014).
--
-- iris_private.decrypt_pii não é exposto via Data API (schema iris_private não está em
-- supabase/config.toml → schemas, mesma limitação documentada em 0015). Wrapper SECURITY DEFINER
-- em iris (schema exposto) encapsula: (a) o filtro "mais recente e NÃO expirado"
-- (expira_em > now(), LGPD/ADR-026) e (b) o decrypt de resumo_enc — nunca expõe iris_private
-- inteiro nem o bytea cru para o client service_role (mesmo padrão de iris.gateway_find_contact_id).

create or replace function iris.memory_get_latest_summary(p_tenant_id uuid, p_contact_id uuid)
returns table (
  id uuid,
  contact_id uuid,
  tenant_id uuid,
  resumo text,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  expira_em timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    cms.id,
    cms.contact_id,
    cms.tenant_id,
    iris_private.decrypt_pii(cms.resumo_enc) as resumo,
    cms.periodo_inicio,
    cms.periodo_fim,
    cms.expira_em,
    cms.created_at
  from iris.contact_memory_summaries cms
  where cms.tenant_id = p_tenant_id
    and cms.contact_id = p_contact_id
    and cms.expira_em > now()
  order by cms.periodo_fim desc
  limit 1;
$$;

revoke execute on function iris.memory_get_latest_summary(uuid, uuid) from public, anon, authenticated;
grant execute on function iris.memory_get_latest_summary(uuid, uuid) to service_role;
