import type { WhatsAppProvider, WhatsAppWebhookPayload } from "@/schemas/whatsapp-gateway.schema";
import { whatsAppWebhookPayloadSchema } from "@/schemas/whatsapp-gateway.schema";
import type { WhatsAppGatewayAdapter } from "@/adapters/whatsapp/types";
import type { WebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import type { TenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import type { EngineMessageRepository } from "@/repositories/engine-message.repository";
import type { HandoffRepository } from "@/repositories/handoff.repository";
import type { QueueRepository } from "@/repositories/queue.repository";
import { InvalidPayloadError } from "@/lib/whatsapp-gateway/errors";

export interface WhatsAppGatewayServiceDeps {
  adapters: Record<WhatsAppProvider, WhatsAppGatewayAdapter>;
  webhookInboxRepo: WebhookInboxRepository;
  tenantLookupRepo: TenantLookupRepository;
  engineMessageRepo: EngineMessageRepository;
  handoffRepo: HandoffRepository;
  queueRepo: QueueRepository;
}

// Requisitos 2-5 da spec — nenhuma chamada a LLM/processamento pesado acontece aqui (Requisito 5):
// só normalização (pura), dedup (1 write), handoff (2 writes leves) e enqueue (1 RPC).
export class WhatsAppGatewayService {
  constructor(private readonly deps: WhatsAppGatewayServiceDeps) {}

  async handleWebhook(provider: WhatsAppProvider, rawPayload: unknown): Promise<{ received: true }> {
    const adapter = this.deps.adapters[provider];
    const normalized = adapter.receive(rawPayload); // pode lançar InvalidPayloadError (payload cru inválido)

    // Defesa em profundidade: garante que a normalização do adapter nunca vaza shape fora do
    // contrato canônico, mesmo que um adapter futuro tenha um bug (ADR-029, critério de aceite #2).
    const check = whatsAppWebhookPayloadSchema.safeParse(normalized);
    if (!check.success) {
      throw new InvalidPayloadError(
        `normalização do adapter "${provider}" produziu shape fora do contrato: ${check.error.message}`
      );
    }
    const payload: WhatsAppWebhookPayload = check.data;

    const tenantId = await this.deps.tenantLookupRepo.findTenantIdByWhatsAppNumber(
      payload.tenant_whatsapp_number
    );
    if (!tenantId) {
      // Edge case (não coberto literalmente pela spec): número sem tenant cadastrado. ACK mesmo
      // assim — o provedor não pode ficar retry-storming por config incompleta do nosso lado.
      // Ver DESVIOS no relatório final.
      return { received: true };
    }

    const isNewMessage = await this.deps.webhookInboxRepo.insertIfNew(tenantId, payload.message_id);
    if (!isNewMessage) {
      // Requisito 3 / ADR-028: reentrega do provedor — no-op idempotente completo, nada reprocessa.
      return { received: true };
    }

    if (payload.from_me) {
      const emittedByEngine = await this.deps.engineMessageRepo.wasEmittedByEngine(
        tenantId,
        payload.message_id
      );
      if (!emittedByEngine) {
        // Requisito 4 / ADR-029: from_me=true e id não é da própria engine → humano mandou do celular.
        const conversationId = await this.deps.handoffRepo.findActiveConversationId(tenantId, payload.from);
        if (conversationId) {
          await this.deps.handoffRepo.pauseForHandoff({
            tenant_id: tenantId,
            conversation_id: conversationId,
            gatilho: "from_me_detectado",
          });
        }
        // Nenhuma conversa ativa encontrada pro contato: no-op gracioso (edge case documentado).
      }
      // from_me nunca vai pra fila de processamento — é eco da própria engine (nada a fazer) ou
      // envio humano manual (não precisa de resposta automática). Decisão de design, ver DESVIOS.
      return { received: true };
    }

    await this.deps.queueRepo.enqueueInboundMessage(tenantId, payload);
    return { received: true };
  }
}
