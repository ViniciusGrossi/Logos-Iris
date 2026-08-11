// Logos Iris — tenant-router-worker (módulo 2, docs/specs/tenant-router-queue.md)
// Consumidor da fila pgmq `whatsapp_inbound`. SEM endpoint HTTP público de verdade: acionado
// 1x/minuto por pg_cron + pg_net (supabase/migrations/0017_tenant_router_worker_cron.sql), roda
// como service_role no runtime Deno das Edge Functions (ADR-031).
//
// Arquitetura real (não é mais desvio): este arquivo importa e chama o TenantRouterService de
// verdade (src/services/tenant-router.service.ts) — o MESMO arquivo-fonte coberto pelos testes
// vitest — via import map (deno.json resolve "@/" para "../../../src/" e os specifiers "zod"/
// "@supabase/supabase-js" para npm:). Nenhuma lógica de negócio é reimplementada aqui: o único
// código Deno-específico é o wiring de DI em deno-client.ts (client Supabase via Deno.env em vez
// de process.env — mesmo espírito de tenant-router.factory.ts do lado Next) e a checagem de
// autenticação da chamada do cron (token dedicado em Vault, ver migration 0017).
//
// Segurança: nenhum dado de contato/conteúdo em log — só ids técnicos e contadores (LGPD).

import { TenantRouterService } from "@/services/tenant-router.service";
import { InvalidQueueMessageError } from "@/services/tenant-router.errors";
import { SupabaseTenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import { SupabaseWebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import { SupabaseConversationRoutingRepository } from "@/repositories/conversation-routing.repository";
import { createDenoServiceClient } from "./deno-client.ts";

const BATCH_SIZE = 20; // ponytail: lote fixo; tornar env se throughput exigir

type QueueRow = { msg_id: number; message: Record<string, unknown> };

Deno.serve(async (req: Request) => {
  const db = createDenoServiceClient();

  // Autenticação: só o pg_cron (via pg_net, migration 0017) deve invocar este worker — não é
  // endpoint de usuário. verify_jwt=false no deploy (custom auth, ver deploy_edge_function); o
  // token dedicado nunca sai do Postgres — a comparação roda inteira em SQL
  // (iris.router_worker_verify_token), esta function só recebe true/false de volta.
  const providedToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: isAuthorized, error: authError } = await db.rpc("router_worker_verify_token", {
    p_token: providedToken,
  });
  if (authError || !isAuthorized) {
    return Response.json({ ok: false, stage: "auth" }, { status: 401 });
  }

  const tenantRouterService = new TenantRouterService({
    tenantLookupRepo: new SupabaseTenantLookupRepository(db),
    webhookInboxRepo: new SupabaseWebhookInboxRepository(db),
    conversationRoutingRepo: new SupabaseConversationRoutingRepository(db),
  });

  const { data: batch, error: consumeError } = await db.rpc("router_consume_whatsapp_inbound", {
    p_max: BATCH_SIZE,
  });
  if (consumeError) {
    return Response.json({ ok: false, stage: "consume", error: consumeError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as QueueRow[];
  let roteadas = 0,
    duplicadas = 0,
    descartadas = 0,
    falhas = 0;

  for (const row of rows) {
    try {
      // TenantRouterService.routeInbound: valida (Zod) → resolve tenant (Req 1, filtra tenant
      // ativo — Req 5) → dedup (Req 4/ADR-028) → roteia sob advisory lock (Req 2/3). Mesma lógica
      // testada nos vitest, sem cópia.
      const result = await tenantRouterService.routeInbound(row.message);

      switch (result.status) {
        case "roteada":
          roteadas++;
          break;
        case "duplicada":
          duplicadas++;
          break;
        case "descartada":
          descartadas++;
          break;
      }
      // Estado terminal (roteada/duplicada/descartada) — remove da fila.
      await db.rpc("router_delete_whatsapp_inbound", { p_msg_id: row.msg_id });
    } catch (err) {
      falhas++;
      if (err instanceof InvalidQueueMessageError) {
        // Item permanentemente malformado (Zod nunca vai aceitar) — deletar agora. Sem isso, o
        // item reaparece a cada vt (30s) para sempre e, como pgmq.read devolve os mais antigos
        // primeiro, um lote de itens malformados (até BATCH_SIZE) satura o batch e trava mensagens
        // novas atrás deles (achado do spec-reviewer, 2026-08-07 — poison-pill/starvation).
        await db.rpc("router_delete_whatsapp_inbound", { p_msg_id: row.msg_id });
      }
      // Qualquer outro erro (rede/DB — transitório): não deleta, mensagem reaparece após o vt
      // p/ retry automático. Reprocesso é seguro (idempotência via webhook_inbox, Requisito 4).
      // Sem log de payload — só contador (LGPD).
    }
  }

  return Response.json({ ok: true, consumidas: rows.length, roteadas, duplicadas, descartadas, falhas });
});
