import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import type { WhatsAppWebhookPayload } from "@/schemas/whatsapp-gateway.schema";

export interface ConversationRoutingRepository {
  /**
   * Unidade de trabalho ATÔMICA do roteador (Requisitos 2 e 3, ADR-028), toda numa transação:
   *   1. resolve a conversa da mensagem (find-or-create por tenant+contato);
   *   2. pega `pg_advisory_xact_lock(hashtext(conversation_id))` — serializa a mesma conversa,
   *      paraleliza conversas distintas (lock por conversa, nunca global);
   *   3. agenda o debounce (conversation_state.debounce_until) p/ o módulo 3.
   * Retorna o conversation_id resolvido. O lock é escopo de transação (só existe dentro do SQL),
   * por isso a unidade inteira roda numa única função SECURITY DEFINER (migração 0016).
   */
  routeUnderConversationLock(params: {
    tenantId: string;
    payload: WhatsAppWebhookPayload;
  }): Promise<{ conversationId: string }>;
}

export class SupabaseConversationRoutingRepository implements ConversationRoutingRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async routeUnderConversationLock(params: {
    tenantId: string;
    payload: WhatsAppWebhookPayload;
  }): Promise<{ conversationId: string }> {
    // pgmq/advisory-lock não são expostos via Data API — wrapper SECURITY DEFINER em iris (0016).
    const { data, error } = await this.db.rpc("router_route_inbound_message", {
      p_tenant_id: params.tenantId,
      p_payload: params.payload,
    });
    if (error) throw new Error(`router_route_inbound_message falhou: ${error.message}`);
    if (!data) throw new Error("router_route_inbound_message não retornou conversation_id");
    return { conversationId: data };
  }
}
