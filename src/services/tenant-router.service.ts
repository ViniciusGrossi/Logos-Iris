import type { WhatsAppWebhookPayload } from "@/schemas/whatsapp-gateway.schema";
import { resolveTenantParamsSchema, inboundQueueItemSchema } from "@/schemas/tenant-router.schema";
import type { ResolveTenantParams } from "@/schemas/tenant-router.schema";
import type { TenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import type { WebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import type { ConversationRoutingRepository } from "@/repositories/conversation-routing.repository";
import { InvalidQueueMessageError } from "@/services/tenant-router.errors";

export interface TenantRouterServiceDeps {
  tenantLookupRepo: TenantLookupRepository;
  webhookInboxRepo: WebhookInboxRepository;
  conversationRoutingRepo: ConversationRoutingRepository;
}

/** Resultado do roteamento de um item da fila. Estado explícito — worker decide ack/log por ele. */
export type RouteInboundResult =
  | { status: "roteada"; tenant_id: string; conversation_id: string }
  | { status: "duplicada"; tenant_id: string }
  | { status: "descartada" };

/**
 * TenantRouterService (módulo 2, tenant-router-queue.md) — consome itens da fila whatsapp_inbound,
 * resolve o tenant pelo número (Requisito 1), descarta órfãos (Requisito 5), garante idempotência
 * (Requisito 4, ADR-028) e delega o roteamento sob advisory lock por conversa (Requisitos 2 e 3)
 * ao repositório/SQL. Nenhum processamento pesado aqui — isso é a engine (módulo 3).
 */
export class TenantRouterService {
  constructor(private readonly deps: TenantRouterServiceDeps) {}

  /** Requisito 1 — resolve tenant_id pelo whatsapp_number cadastrado. Número desconhecido → null. */
  async resolveTenant(params: ResolveTenantParams): Promise<{ tenant_id: string } | null> {
    const parsed = resolveTenantParamsSchema.safeParse(params);
    if (!parsed.success) throw new InvalidQueueMessageError(parsed.error.message);

    const tenantId = await this.deps.tenantLookupRepo.findTenantIdByWhatsAppNumber(
      parsed.data.tenant_whatsapp_number
    );
    return tenantId ? { tenant_id: tenantId } : null;
  }

  /** Roteia um item da fila. Ordem fixa: validar → resolver → dedup → rotear sob lock. */
  async routeInbound(rawItem: unknown): Promise<RouteInboundResult> {
    // Trust boundary da fila: item pode chegar malformado ou com tenant_id injetado. Zod valida e
    // descarta chaves fora do contrato (tenant_id embutido é ignorado — re-resolvemos pelo número).
    const parsed = inboundQueueItemSchema.safeParse(rawItem);
    if (!parsed.success) throw new InvalidQueueMessageError(parsed.error.message);
    const payload: WhatsAppWebhookPayload = parsed.data;

    const resolved = await this.resolveTenant({
      tenant_whatsapp_number: payload.tenant_whatsapp_number,
    });
    if (!resolved) return { status: "descartada" }; // Requisito 5 — órfão, sem exceção
    const tenantId = resolved.tenant_id;

    // Requisito 4 / ADR-028 — dedup no ponto de entrada; reentrega da fila não roteia 2x.
    const isNew = await this.deps.webhookInboxRepo.insertIfNew(tenantId, payload.message_id);
    if (!isNew) return { status: "duplicada", tenant_id: tenantId };

    // Requisitos 2 e 3 — find-or-create conversa + pg_advisory_xact_lock por conversa, tudo no SQL.
    const { conversationId } = await this.deps.conversationRoutingRepo.routeUnderConversationLock({
      tenantId,
      payload,
    });

    return { status: "roteada", tenant_id: tenantId, conversation_id: conversationId };
  }
}
