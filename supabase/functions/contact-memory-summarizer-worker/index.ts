// Logos Iris — contact-memory-summarizer-worker (docs/specs/contact-memory.md)
// Consumidor da fila pgmq `contact_memory_summarize` (migração 0022). Acionado 1x/minuto por
// pg_cron + pg_net, roda como service_role no runtime Deno das Edge Functions (ADR-031) — mesma
// arquitetura de tenant-router-worker/debouncer-flush-worker: importa e chama o
// ContactMemoryService real (src/services/contact-memory.service.ts, já coberto pelos testes
// vitest) via import map, nenhuma lógica de negócio duplicada aqui.
//
// summaryGenerator: a spec (Fora de Escopo) delega "qual prompt, qual modelo" ao ModelGateway —
// mas o codebase ainda não tem NENHUM client de invocação real de LLM (ModelGatewayService só tem
// routeModel, que ESCOLHE o modelo, nunca chama uma API de completion — ver
// src/services/model-gateway.service.ts). Por isso o generator injetado aqui lança
// SummaryGenerationNotImplementedError (já tipado em src/services/contact-memory.errors.ts,
// pensado exatamente para este worker) em vez de fabricar um resumo heurístico — nunca gravar
// resumo_enc com conteúdo inventado. Trocar por uma chamada real assim que o ModelGateway ganhar
// um client de completion (Sync Requests 2026-09-10: task_type dedicado de sumarização +
// tier_do_plano real no generator, hoje hardcoded como stopgap documentado).
//
// Segurança: nenhum conteúdo de mensagem/resumo em log — só ids técnicos e contadores (LGPD).

import { ZodError } from "zod";
import { ContactMemoryService, type ContactMemorySummaryGenerator } from "@/services/contact-memory.service";
import { SupabaseContactMemoryRepository } from "@/repositories/contact-memory.repository";
import { SummaryGenerationNotImplementedError, NoMessagesInPeriodError } from "@/services/contact-memory.errors";
import { createDenoServiceClient } from "./deno-client.ts";

const BATCH_SIZE = 20; // mesmo default de tenant-router-worker

const summaryGenerator: ContactMemorySummaryGenerator = {
  generate() {
    throw new SummaryGenerationNotImplementedError();
  },
};

type QueueRow = {
  msg_id: number;
  message: { tenant_id: string; contact_id: string; periodo_inicio: string; periodo_fim: string };
};

Deno.serve(async (req: Request) => {
  const db = createDenoServiceClient();

  // Autenticação: só o pg_cron deve invocar este worker — mesmo token dedicado em Vault reusado
  // de 0017/0019 (iris_private.tenant_router_worker_token()), comparação 100% em SQL via
  // iris.router_worker_verify_token — nunca a service_role key do projeto.
  const providedToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: isAuthorized, error: authError } = await db.rpc("router_worker_verify_token", {
    p_token: providedToken,
  });
  if (authError || !isAuthorized) {
    return Response.json({ ok: false, stage: "auth" }, { status: 401 });
  }

  const contactMemoryService = new ContactMemoryService({
    contactMemoryRepo: new SupabaseContactMemoryRepository(db),
    summaryGenerator,
  });

  // memory_consume_summarize_queue/memory_delete_summarize_queue_item (migração 0022) — wrappers
  // SECURITY DEFINER em iris, mesmo padrão de router_consume_whatsapp_inbound/
  // router_delete_whatsapp_inbound (0016). Sem Repository dedicado: operação de fila é interna do
  // worker, não faz parte do contrato público do ContactMemoryService.
  const { data: batch, error: consumeError } = await db.rpc("memory_consume_summarize_queue", {
    p_max: BATCH_SIZE,
  });
  if (consumeError) {
    return Response.json({ ok: false, stage: "consume", error: consumeError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as QueueRow[];
  let resumidas = 0,
    aguardando_capability = 0,
    descartadas = 0,
    falhas = 0;

  for (const row of rows) {
    try {
      await contactMemoryService.summarizeContactMemory({
        tenant_id: row.message.tenant_id,
        contact_id: row.message.contact_id,
        periodo_inicio: row.message.periodo_inicio,
        periodo_fim: row.message.periodo_fim,
      });
      resumidas++;
      await db.rpc("memory_delete_summarize_queue_item", { p_msg_id: row.msg_id });
    } catch (err) {
      if (err instanceof SummaryGenerationNotImplementedError) {
        // Não é poison-pill nem falha transitória — a capability real ainda não existe. NÃO
        // deleta da fila: reaparece após o vt (60s) e será tentada de novo no próximo tick, até
        // o generator real existir. Contabilizado à parte de "falhas" pra não disparar alarme.
        aguardando_capability++;
        continue;
      }
      if (err instanceof ZodError || err instanceof NoMessagesInPeriodError) {
        // Poison-pill (achado do /code-review, mesma classe do bug de tenant-router-worker
        // 2026-08-07): payload malformado (ZodError) ou período sem nenhuma mensagem nova
        // (NoMessagesInPeriodError) NUNCA vai ter sucesso em retry — reaparecer a cada vt (60s)
        // pra sempre satura o batch. Item permanentemente inválido: deletar agora.
        await db.rpc("memory_delete_summarize_queue_item", { p_msg_id: row.msg_id });
        descartadas++;
        continue;
      }
      falhas++;
      // Erro transitório (rede/DB): não deleta, mensagem reaparece após o vt para retry
      // automático (mesmo raciocínio de tenant-router-worker para erros não-permanentes).
    }
  }

  return Response.json({ ok: true, consumidas: rows.length, resumidas, aguardando_capability, descartadas, falhas });
});
