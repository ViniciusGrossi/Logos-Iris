// Logos Iris — tenant-router-worker (módulo 2, docs/specs/tenant-router-queue.md)
// Consumidor da fila pgmq `whatsapp_inbound`. SEM endpoint HTTP público: acionado por pg_cron
// (schedule interno), roda como service_role no runtime Deno das Edge Functions (ADR-031).
//
// DESVIO/SYNC (ver relatório): este loop é o espelho, no runtime Deno, da orquestração de
// `TenantRouterService` (src/services/tenant-router.service.ts) — a fronteira Next↔Deno impede
// importar o Service tipado/testado. As regras (resolver tenant pelo número → descartar órfão →
// dedup webhook_inbox → rotear sob advisory lock) são as MESMAS; a fonte de verdade e a cobertura
// de teste (vitest) vivem no Service. Alternativa p/ eliminar a duplicação: hospedar o consumidor
// como função agendada no runtime Next reusando o Service. Decisão do orquestrador.
//
// Segurança: nenhum dado de contato/conteúdo em log — só ids técnicos e contadores (LGPD).

import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 20; // ponytail: lote fixo; tornar env se throughput exigir

type QueueRow = { msg_id: number; message: Record<string, unknown> };

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "iris" }, auth: { persistSession: false } },
  );

  const { data: batch, error: consumeError } = await supabase.rpc(
    "router_consume_whatsapp_inbound",
    { p_max: BATCH_SIZE },
  );
  if (consumeError) {
    return Response.json({ ok: false, stage: "consume", error: consumeError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as QueueRow[];
  let roteadas = 0, duplicadas = 0, descartadas = 0, falhas = 0;

  for (const row of rows) {
    try {
      const payload = row.message;
      const number = String(payload["tenant_whatsapp_number"] ?? "");
      const messageId = String(payload["message_id"] ?? "");
      if (!number || !messageId) throw new Error("item de fila sem tenant_whatsapp_number/message_id");

      // 1. resolver tenant pelo número (Requisito 1)
      const { data: tenant, error: tErr } = await supabase
        .from("tenants").select("id").eq("whatsapp_number", number).maybeSingle();
      if (tErr) throw tErr;

      if (!tenant) {
        // Requisito 5 — número órfão: descarta da fila, sem exceção, sem roteamento.
        descartadas++;
        await supabase.rpc("router_delete_whatsapp_inbound", { p_msg_id: row.msg_id });
        continue;
      }
      const tenantId = tenant.id as string;

      // 2. dedup no ponto de entrada (Requisito 4 / ADR-028) — reentrega não roteia 2x.
      const { data: inserted, error: dErr } = await supabase
        .from("webhook_inbox")
        .upsert(
          { tenant_id: tenantId, provider_message_id: messageId },
          { onConflict: "tenant_id,provider_message_id", ignoreDuplicates: true },
        )
        .select("tenant_id");
      if (dErr) throw dErr;

      if ((inserted?.length ?? 0) === 0) {
        duplicadas++;
        await supabase.rpc("router_delete_whatsapp_inbound", { p_msg_id: row.msg_id });
        continue;
      }

      // 3. rotear sob advisory lock por conversa (Requisitos 2 e 3) — unidade atômica no SQL.
      const { error: rErr } = await supabase.rpc("router_route_inbound_message", {
        p_tenant_id: tenantId,
        p_payload: payload,
      });
      if (rErr) throw rErr;

      roteadas++;
      await supabase.rpc("router_delete_whatsapp_inbound", { p_msg_id: row.msg_id });
    } catch (_e) {
      // Não deleta: mensagem reaparece após o vt (30s) p/ retry automático. Reprocesso é seguro
      // (idempotência via webhook_inbox). Sem log de payload — só contador (LGPD).
      falhas++;
    }
  }

  return Response.json({ ok: true, consumidas: rows.length, roteadas, duplicadas, descartadas, falhas });
});
