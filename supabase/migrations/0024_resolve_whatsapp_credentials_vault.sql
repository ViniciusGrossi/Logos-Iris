-- Logos Iris — 0024: ALTO-2 (review de segurança fase 9) — resolve credentials_ref via Supabase
-- Vault antes de entregar ao client HTTP. Achado: evolution.adapter.ts/openwa.adapter.ts/
-- cloud-api.adapter.ts passavam `whatsapp_connections.credentials_ref` direto como apikey/token/
-- accessToken, mas essa coluna é só uma REFERÊNCIA ao Vault (ex.: 'vault:iris/bella-estetica/
-- evolution', ver ARCHITECTURE.md §1.2 e seed.sql) — nunca o segredo em claro. Fix: wrapper
-- SECURITY DEFINER que resolve a referência (mesmo padrão de iris.memory_get_latest_summary, 0020)
-- — o Repository passa a chamar esta função em vez de repassar a coluna crua (ver
-- src/repositories/whatsapp-connection.repository.ts).

create or replace function iris.resolve_whatsapp_credentials(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_secret_name text;
  v_secret text;
begin
  select credentials_ref into v_ref
  from iris.whatsapp_connections
  where tenant_id = p_tenant_id;

  if v_ref is null then
    return null; -- sem conexão configurada pro tenant — mesmo comportamento de getByTenantId hoje
  end if;

  if left(v_ref, 6) is distinct from 'vault:' then
    raise exception 'resolve_whatsapp_credentials: credentials_ref malformado pro tenant % (esperado prefixo "vault:")', p_tenant_id
      using errcode = 'P0003';
  end if;

  v_secret_name := substr(v_ref, 7);

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = v_secret_name;

  if v_secret is null then
    -- Falha alta e explícita (nunca fallback silencioso pra string 'vault:...' como credencial) —
    -- precondição operacional: cadastrar o secret real via vault.create_secret(secret, name) antes
    -- de qualquer tenant ligar o path outbound (send()/pareamento()).
    raise exception 'resolve_whatsapp_credentials: nenhum secret no Vault com nome "%" (tenant %) — cadastrar via vault.create_secret antes de habilitar o path outbound', v_secret_name, p_tenant_id
      using errcode = 'P0004';
  end if;

  return v_secret;
end;
$$;

revoke execute on function iris.resolve_whatsapp_credentials(uuid) from public, anon, authenticated;
grant execute on function iris.resolve_whatsapp_credentials(uuid) to service_role;
