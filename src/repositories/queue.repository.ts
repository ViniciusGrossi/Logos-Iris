import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import type { WhatsAppWebhookPayload } from "@/schemas/whatsapp-gateway.schema";

export interface QueueRepository {
  /** Enfileira em pgmq (whatsapp_inbound) — consumo é do módulo 2 (tenant-router-queue.md). */
  enqueueInboundMessage(tenantId: string, payload: WhatsAppWebhookPayload): Promise<void>;
}

export class SupabaseQueueRepository implements QueueRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async enqueueInboundMessage(tenantId: string, payload: WhatsAppWebhookPayload): Promise<void> {
    // pgmq não é exposto via Data API — wrapper SECURITY DEFINER em iris (migração 0015).
    const { error } = await this.db.rpc("gateway_enqueue_whatsapp_message", {
      p_payload: { tenant_id: tenantId, ...payload },
    });
    if (error) throw new Error(`enqueue whatsapp_inbound falhou: ${error.message}`);
  }
}
