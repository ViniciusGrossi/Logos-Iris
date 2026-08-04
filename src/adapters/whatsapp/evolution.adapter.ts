import type { WhatsAppGatewayAdapter, WhatsAppWebhookPayload, MediaType } from "./types";
import type { WhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import { evolutionRawSchema } from "@/schemas/whatsapp-gateway.schema";
import { InvalidPayloadError } from "@/lib/whatsapp-gateway/errors";

function stripJidSuffix(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "");
}

function extractContent(
  message: Record<string, unknown> | undefined,
  messageType: string
): { content: string; media_type: MediaType } {
  const captionOf = (key: string): string => {
    const node = message?.[key];
    if (node && typeof node === "object" && "caption" in node) {
      const value = (node as Record<string, unknown>).caption;
      return typeof value === "string" ? value : "";
    }
    return "";
  };

  switch (messageType) {
    case "conversation":
      return { content: typeof message?.conversation === "string" ? message.conversation : "", media_type: "texto" };
    case "extendedTextMessage": {
      const node = message?.extendedTextMessage;
      const text = node && typeof node === "object" && "text" in node ? (node as Record<string, unknown>).text : "";
      return { content: typeof text === "string" ? text : "", media_type: "texto" };
    }
    case "imageMessage":
      return { content: captionOf("imageMessage"), media_type: "imagem" };
    case "audioMessage":
      return { content: "", media_type: "audio" };
    case "documentMessage":
      return { content: captionOf("documentMessage"), media_type: "documento" };
    default:
      // ponytail: messageType não mapeado (Evolution tem dezenas) — trata como texto vazio.
      // Ampliar o switch quando um tipo real não coberto aparecer em produção.
      return { content: "", media_type: "texto" };
  }
}

// Evolution API (Baileys) — evento "messages.upsert". fromMe nativo em data.key.fromMe.
export class EvolutionAdapter implements WhatsAppGatewayAdapter {
  constructor(private readonly connectionRepo: WhatsAppConnectionRepository) {}

  receive(rawPayload: unknown): WhatsAppWebhookPayload {
    const parsed = evolutionRawSchema.safeParse(rawPayload);
    if (!parsed.success) throw new InvalidPayloadError(parsed.error.message);

    const { data } = parsed;
    const { content, media_type } = extractContent(
      data.data.message as Record<string, unknown> | undefined,
      data.data.messageType
    );

    return {
      provider: "evolution",
      tenant_whatsapp_number: stripJidSuffix(data.sender),
      from: stripJidSuffix(data.data.key.remoteJid),
      message_id: data.data.key.id,
      content,
      media_type,
      from_me: data.data.key.fromMe,
      timestamp: new Date(data.data.messageTimestamp * 1000).toISOString(),
    };
  }

  async send(params: {
    tenant_id: string;
    to: string;
    content: string;
    media_type: MediaType;
  }): Promise<{ provider_message_id: string }> {
    const connection = await this.connectionRepo.getByTenantId(params.tenant_id);
    if (!connection || connection.session_status !== "conectado") {
      throw new Error(`Evolution: tenant ${params.tenant_id} não está conectado`);
    }
    // ponytail: wire format do POST /message/sendText/{instance} da Evolution API v2 (self-hosted,
    // sem sandbox disponível pra verificar credencial real) — endpoint/headers documentados na
    // Evolution API oficial, não verificados end-to-end aqui. Ver SYNC REQUESTS no relatório.
    const baseUrl = process.env.EVOLUTION_API_BASE_URL;
    if (!baseUrl) throw new Error("EVOLUTION_API_BASE_URL ausente — configure .env.local");

    const response = await fetch(`${baseUrl}/message/sendText/${connection.instance_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: connection.credentials_ref },
      body: JSON.stringify({ number: params.to, text: params.content }),
    });
    if (!response.ok) throw new Error(`Evolution send falhou: HTTP ${response.status}`);
    const body = (await response.json()) as { key?: { id?: string } };
    if (!body.key?.id) throw new Error("Evolution send: resposta sem message id");
    return { provider_message_id: body.key.id };
  }

  async status(tenant_id: string): Promise<{ session_status: "conectado" | "desconectado" | "pareando" }> {
    const connection = await this.connectionRepo.getByTenantId(tenant_id);
    return { session_status: connection?.session_status ?? "desconectado" };
  }

  async pareamento(tenant_id: string): Promise<{ qr_code_base64: string } | { status: "ja_pareado" }> {
    const connection = await this.connectionRepo.getByTenantId(tenant_id);
    if (connection?.session_status === "conectado") return { status: "ja_pareado" };

    // ponytail: endpoint de QR code (GET /instance/connect/{instance}) não verificado contra
    // instância real — mesma ressalva de send(). Gap de pairing endpoint já registrado na spec
    // (Sync Request candidata) é sobre o endpoint ADMIN, não sobre esta chamada interna do adapter.
    const baseUrl = process.env.EVOLUTION_API_BASE_URL;
    if (!baseUrl || !connection) throw new Error("Evolution: conexão/instância não configurada");

    const response = await fetch(`${baseUrl}/instance/connect/${connection.instance_id}`, {
      headers: { apikey: connection.credentials_ref },
    });
    if (!response.ok) throw new Error(`Evolution pareamento falhou: HTTP ${response.status}`);
    const body = (await response.json()) as { base64?: string };
    if (!body.base64) throw new Error("Evolution pareamento: resposta sem QR code");
    return { qr_code_base64: body.base64 };
  }
}
