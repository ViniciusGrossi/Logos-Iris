// Logos Iris — debouncer-flush-worker (módulo 3, docs/specs/message-debouncer.md)
// Acionado 1x/minuto por pg_cron + pg_net (supabase/migrations/0019_debouncer_flush_cron.sql),
// roda como service_role no runtime Deno das Edge Functions (ADR-031) — mesma arquitetura de
// tenant-router-worker: importa e chama o MessageDebouncerService real (src/services/
// message-debouncer.service.ts, já coberto pelos testes vitest) via import map, nenhuma lógica de
// negócio duplicada aqui.
//
// TODO(conversation-engine-v1): esta v1 do Engine só implementa compilePrompt (camadas 1-2,
// ADR-027) — SEM Controller/route.ts e SEM consumir model-gateway.service.ts (decisão registrada
// em docs/specs/conversation-engine-v1.md, seção "Fora de Escopo", confirmada pelo spec-reviewer
// em 2026-08-04). Não existe hoje nenhum caller que receba os message_ids agregados e dispare o
// Engine de fato — mesma situação já aceita para escalateByLowConfidence/escalateByCustomerRequest
// (human-handoff, Sync Request 2026-09-10) e para logModelUsage (cost-observability-v1). Este
// worker cumpre os Requisitos 3/4 da spec (varrer + limpar o buffer) e loga a contagem agregada;
// acionar o Engine de verdade fica para quando ele ganhar um loop de tools/HTTP real.
//
// Segurança: nenhum conteúdo de mensagem em log — só ids técnicos e contadores (LGPD).

import { MessageDebouncerService } from "@/services/message-debouncer.service";
import { SupabaseMessageDebouncerRepository } from "@/repositories/message-debouncer.repository";
import { createDenoServiceClient } from "./deno-client.ts";

Deno.serve(async (req: Request) => {
  const db = createDenoServiceClient();

  // Autenticação: só o pg_cron (via pg_net, migration 0019) deve invocar este worker — mesmo
  // token dedicado em Vault reusado de 0017 (iris_private.tenant_router_worker_token()),
  // comparação 100% em SQL via iris.router_worker_verify_token — nunca a service_role key.
  const providedToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: isAuthorized, error: authError } = await db.rpc("router_worker_verify_token", {
    p_token: providedToken,
  });
  if (authError || !isAuthorized) {
    return Response.json({ ok: false, stage: "auth" }, { status: 401 });
  }

  const debouncerService = new MessageDebouncerService({
    debouncerRepo: new SupabaseMessageDebouncerRepository(db),
  });

  let due: { conversationId: string; messageIds: string[] }[];
  try {
    due = await debouncerService.flushDue();
  } catch (err) {
    return Response.json(
      { ok: false, stage: "flush_due", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  let limpas = 0,
    falhas = 0;

  for (const { conversationId, messageIds } of due) {
    try {
      // Ver TODO(conversation-engine-v1) no topo do arquivo — Engine ainda não tem loop real
      // pra consumir messageIds. Requisito 4: limpar o buffer é o que evita reprocessamento
      // infinito da mesma conversa, isso roda mesmo sem o Engine estar pronto.
      await debouncerService.clearDebounce(conversationId);
      limpas++;
      void messageIds; // agregados, ainda sem consumidor — contagem já refletida no length abaixo
    } catch {
      falhas++;
      // Transitório (rede/DB): não propaga — conversa permanece com debounce_until vencido e
      // será revarrida no próximo tick (idempotente, sem duplicar efeito nenhum já que o único
      // efeito hoje é o clear).
    }
  }

  return Response.json({ ok: true, conversas_devidas: due.length, limpas, falhas });
});
