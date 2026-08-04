import type { WhatsAppWebhookPayload, WhatsAppProvider, MediaType } from "@/schemas/whatsapp-gateway.schema";

export type { WhatsAppWebhookPayload, WhatsAppProvider, MediaType };

// Contrato interno — cópia exata de docs/specs/whatsapp-gateway.md § "Contrato interno (não HTTP)".
// Consumido só por TenantRouterService/ConversationEngineService (fora desta spec) — nunca editar
// sem Spec Sync Request, mesmo não estando em specs/api.contracts.ts (é contrato interno do módulo,
// mas ainda assim documento canônico da feature).
export interface WhatsAppGatewayAdapter {
  send(params: {
    tenant_id: string;
    to: string;
    content: string;
    media_type: MediaType;
  }): Promise<{ provider_message_id: string }>;

  receive(rawPayload: unknown): WhatsAppWebhookPayload; // normaliza from_me aqui, por adapter

  status(tenant_id: string): Promise<{ session_status: "conectado" | "desconectado" | "pareando" }>;

  pareamento(tenant_id: string): Promise<{ qr_code_base64: string } | { status: "ja_pareado" }>;
}

// webhook_inbox (ARCHITECTURE.md §1.6) — dedup global, não-particionada, TTL 7d via pg_cron
export interface WebhookInboxRow {
  tenant_id: string;
  provider_message_id: string;
  received_at: string;
}

// whatsapp_connections (ARCHITECTURE.md §1.2) — 1:1 com tenant, RLS ON sem policy (ADR-018)
export interface WhatsAppConnectionRow {
  tenant_id: string;
  provider: WhatsAppProvider;
  instance_id: string;
  credentials_ref: string;
  session_status: "conectado" | "desconectado" | "pareando";
  updated_at: string;
}
