// Logos Iris — debouncer-flush-worker (módulo 3, docs/specs/message-debouncer.md)
// Acionado por pg_cron a cada 10s (ADR-031) via pg_net. Varre conversation_state com
// debounce_until vencido, agrega os message_ids e invoca o Engine para cada conversa.
// Nesta v1, o Engine ainda não está integrado (conversation-engine-v1 é só compilePrompt) —
// o worker faz o flush e limpa o debounce, preparando o terreno para a integração na wave 1.
//
// Segurança: autenticado por token dedicado em Vault (mesmo padrão de 0017). Nenhum dado
// de contato/conteúdo em log — só ids técnicos e contadores (LGPD).

import { MessageDebouncerService } from "@/services/message-debouncer.service";
import { SupabaseMessageDebouncerRepository } from "@/repositories/message-debouncer.repository";
import { createDenoServiceClient } from "../tenant-router-worker/deno-client.ts";

Deno.serve(async (req: Request) => {
  const db = createDenoServiceClient();

  // Autenticação: mesmo padrão do tenant-router-worker (0017) — token dedicado em Vault,
  // comparação roda 100% em SQL, a function nunca vê o valor real.
  const providedToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: isAuthorized, error: authError } = await db.rpc("router_worker_verify_token", {
    p_token: providedToken,
  });
  if (authError || !isAuthorized) {
    return Response.json({ ok: false, stage: "auth" }, { status: 401 });
  }

  const debouncerRepo = new SupabaseMessageDebouncerRepository(db);
  const debouncerService = new MessageDebouncerService({ debouncerRepo });

  // Requisito 3: flushDue — varre conversas com debounce vencido
  let due: { conversationId: string; messageIds: string[] }[];
  try {
    due = await debouncerService.flushDue();
  } catch (err) {
    return Response.json(
      { ok: false, stage: "flush", error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }

  let processadas = 0;
  let falhas = 0;

  for (const batch of due) {
    try {
      // Nesta v1 (wave 0), o Engine ainda não está integrado — o conversation-engine-v1
      // é só compilePrompt (função pura, sem HTTP). O flush prepara o terreno: quando o
      // Engine completo entrar na wave 1, este loop vai chamar ConversationEngineService
      // com os message_ids agregados.
      //
      // Por enquanto, apenas limpamos o debounce (CA#4) para que a conversa saia do
      // índice parcial e não seja reprocessada no próximo tick.

      // TODO(wave 1): integrar com ConversationEngineService.processBatch(batch)
      // Ex: await engineService.processBatch({
      //   conversationId: batch.conversationId,
      //   messageIds: batch.messageIds,
      // });

      await debouncerService.clearDebounce(batch.conversationId);
      processadas++;
    } catch (err) {
      falhas++;
      // Erro no clearDebounce de UMA conversa não para as outras.
      // Sem log de payload — só contador (LGPD).
    }
  }

  return Response.json({
    ok: true,
    due_count: due.length,
    processadas,
    falhas,
  });
});