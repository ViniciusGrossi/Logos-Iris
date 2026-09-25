-- Logos Iris — 0027: achado do /code-review sobre 0026 — GetDailySummary calculava "hoje" no
-- cliente via new Date().toISOString() (UTC), truncado pro dia UTC — nos últimos ~3h de cada dia
-- de negócio em horário BR (America/Sao_Paulo, UTC-3), toISOString() já reporta o dia seguinte,
-- então o dashboard filtrava pelo dia ERRADO e mostrava totais quase vazios. Fix: p_data agora é
-- opcional (default null) — quando omitido, "hoje" é calculado no fuso do PRÓPRIO TENANT dentro do
-- RPC (mesmo padrão de iris.appointments_due_for_confirmation, migração 0025), nunca no cliente.

create or replace function iris.dashboard_summary(p_tenant_id uuid, p_data date default null)
returns table (
  total_conversas int,
  orcamentos_gerados int,
  agendamentos_criados int,
  leads_quentes jsonb
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_data date := coalesce(
    p_data,
    (now() at time zone (select t.timezone from iris.tenants t where t.id = p_tenant_id))::date
  );
begin
  return query
  select
    (select count(*)::int from iris.conversations c where c.tenant_id = p_tenant_id and c.updated_at::date = v_data),
    (select count(*)::int from iris.conversation_signals s where s.tenant_id = p_tenant_id and s.tipo = 'orcamento' and s.created_at::date = v_data),
    (select count(*)::int from iris.appointments a where a.tenant_id = p_tenant_id and a.created_at::date = v_data),
    (select coalesce(jsonb_agg(jsonb_build_object('conversation_id', s.conversation_id, 'resumo', s.payload ->> 'resumo') order by s.created_at desc), '[]'::jsonb)
       from iris.conversation_signals s where s.tenant_id = p_tenant_id and s.tipo = 'lead_quente' and s.created_at::date = v_data);
end;
$$;

revoke execute on function iris.dashboard_summary(uuid, date) from public, anon, authenticated;
grant execute on function iris.dashboard_summary(uuid, date) to service_role;
