-- Logos Iris — 0023: defesa em profundidade — trigger functions em iris_private nunca devem ser
-- chamáveis diretamente via RPC/SQL por anon/authenticated. Toda outra função de 0018-0022 já
-- revoga explicitamente (padrão do projeto); contacts_cascade_forget (nova, 0022) e set_updated_at
-- (pré-existente, usada como trigger em várias tabelas desde 0002) ficaram com o GRANT default de
-- PUBLIC. Revogar não quebra a invocação via trigger (o mecanismo de trigger do Postgres invoca a
-- função internamente, não checa EXECUTE do role chamador da instrução DML).
revoke execute on function iris_private.contacts_cascade_forget() from public, anon, authenticated;
revoke execute on function iris_private.set_updated_at() from public, anon, authenticated;
