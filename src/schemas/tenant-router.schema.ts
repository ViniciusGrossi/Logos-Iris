import { z } from "zod";

import { whatsAppWebhookPayloadSchema } from "@/schemas/whatsapp-gateway.schema";

// ── Param do contrato TenantRouterService.resolveTenant (specs/api.contracts.ts) ──
export const resolveTenantParamsSchema = z.object({
  tenant_whatsapp_number: z.string().min(1),
});
export type ResolveTenantParams = z.infer<typeof resolveTenantParamsSchema>;

// ── Item consumido da fila pgmq whatsapp_inbound ──────────────────────────────
// Trust boundary: vem da fila (produzido pelo whatsapp-gateway), pode chegar malformado.
// O gateway enfileira `{ tenant_id, ...WhatsAppWebhookPayload }`; o Router NÃO confia no
// tenant_id embutido — re-resolve por tenant_whatsapp_number (Requisito 1 + critério RLS).
// Por isso o schema valida só o payload canônico; qualquer tenant_id extra é descartado.
export const inboundQueueItemSchema = whatsAppWebhookPayloadSchema;
export type InboundQueueItem = z.infer<typeof inboundQueueItemSchema>;
