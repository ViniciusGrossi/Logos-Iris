import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

export interface WebhookInboxRepository {
  /**
   * Insere (tenant_id, provider_message_id) em webhook_inbox se ainda não existir.
   * Retorna true = mensagem nova (inserida agora); false = duplicata (reentrega do provedor).
   * ADR-028: idempotência via PK composta, atômico (ON CONFLICT DO NOTHING) — sem race
   * condition entre select-then-insert.
   */
  insertIfNew(tenantId: string, providerMessageId: string): Promise<boolean>;
}

// webhook_inbox — RLS ON sem policy (ADR-018). Só acessível via service_role.
export class SupabaseWebhookInboxRepository implements WebhookInboxRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async insertIfNew(tenantId: string, providerMessageId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("webhook_inbox")
      .upsert(
        { tenant_id: tenantId, provider_message_id: providerMessageId, received_at: new Date().toISOString() },
        { onConflict: "tenant_id,provider_message_id", ignoreDuplicates: true }
      )
      .select("tenant_id");

    if (error) throw new Error(`webhook_inbox insert falhou: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
}
