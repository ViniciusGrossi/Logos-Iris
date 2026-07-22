-- Logos Iris — 0001: extensões, schemas, pgcrypto + Vault
-- Fundação: precisa existir antes de qualquer tabela com PII (contacts, messages, contact_memory_summaries, knowledge_chunks).
--
-- Instância Supabase COMPARTILHADA entre vários produtos Logos Tech (delphi, logos_platform, logos_polis,
-- concurso, padaria, paideia, Mens-Sana, Logus_Tech_Oficinas já existem como schemas próprios nesta mesma base).
-- Logos Iris segue o mesmo padrão: schema `iris` para tabelas de produto, `iris_private` para as funções
-- SECURITY DEFINER de pgcrypto (em vez do `private` genérico do ARCHITECTURE.md §Plano pgcrypto — nome
-- genérico colidiria/seria ambíguo numa base compartilhada por N produtos). Ver DESVIOS no report final.

create schema if not exists iris;
create schema if not exists iris_private;

revoke all on schema iris_private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

-- ── Vault: pepper HMAC (lookup determinístico de telefone) + chave simétrica (pgp_sym_encrypt/decrypt) ──
-- Idempotente: só cria o secret se ainda não existir (nome único em vault.secrets).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'iris_pii_pepper') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'iris_pii_pepper',
      'Logos Iris — pepper HMAC-SHA256 para telefone_hash (lookup determinístico de contacts)'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'iris_pii_symmetric_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'iris_pii_symmetric_key',
      'Logos Iris — chave simétrica pgp_sym_encrypt/decrypt para colunas *_enc'
    );
  end if;
end;
$$;

-- ── Funções SECURITY DEFINER (search_path='' obrigatório — evita hijack via search_path da sessão) ──

create or replace function iris_private.pii_pepper()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'iris_pii_pepper';
$$;

create or replace function iris_private.pii_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'iris_pii_symmetric_key';
$$;

-- Hash determinístico p/ lookup (WHERE tenant_id=$t AND telefone_hash=private.phone_hash($tel)).
create or replace function iris_private.phone_hash(p_value text)
returns bytea
language sql
security definer
set search_path = ''
as $$
  select extensions.hmac(p_value, iris_private.pii_pepper(), 'sha256');
$$;

-- Cifra p/ leitura (IV aleatório — ciphertext muda a cada escrita, nunca use em WHERE).
create or replace function iris_private.encrypt_pii(p_value text)
returns bytea
language sql
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_encrypt(p_value, iris_private.pii_key());
$$;

create or replace function iris_private.decrypt_pii(p_value bytea)
returns text
language sql
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_decrypt(p_value, iris_private.pii_key());
$$;

revoke execute on function iris_private.pii_pepper() from public, anon, authenticated;
revoke execute on function iris_private.pii_key() from public, anon, authenticated;
revoke execute on function iris_private.phone_hash(text) from public, anon, authenticated;
revoke execute on function iris_private.encrypt_pii(text) from public, anon, authenticated;
revoke execute on function iris_private.decrypt_pii(bytea) from public, anon, authenticated;

grant execute on function iris_private.pii_pepper() to service_role;
grant execute on function iris_private.pii_key() to service_role;
grant execute on function iris_private.phone_hash(text) to service_role;
grant execute on function iris_private.encrypt_pii(text) to service_role;
grant execute on function iris_private.decrypt_pii(bytea) to service_role;

-- ── Trigger genérico updated_at (usado por toda tabela do schema iris) ──
create or replace function iris_private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
