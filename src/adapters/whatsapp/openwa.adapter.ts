import type { WhatsAppGatewayAdapter, WhatsAppWebhookPayload, MediaType } from "./types";
import type { WhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import { openwaRawSchema } from "@/schemas/whatsapp-gateway.schema";
import { InvalidPayloadError } from "@/lib/whatsapp-gateway/errors";

function stripCUsSuffix(jid: string): string {
  return jid.replace(/@c\.us$/, "");
}

function mapMediaType(type: string): MediaType {
  switch (type) {
    case "chat":
      return "texto";
    case "ptt":
    case "audio":
      return "audio";
    case "image":
      return "imagem";
    case "document":
      return "documento";
    default:
      // ponytail: tipo OpenWA não mapeado (sticker/vcard/location/...) — trata como texto.
      return "texto";
  }
}

// OpenWA (open-wa/wa-automate) — objeto Message. fromMe nativo TOP-LEVEL (caminho diferente
// do aninhado data.key.fromMe da Evolution) — prova o contrato de normalização por adapter (ADR-029).
export class OpenWaAdapter implements WhatsAppGatewayAdapter {
  constructor(private readonly connectionRepo: WhatsAppConnectionRepository) {}

  receive(rawPayload: unknown): WhatsAppWebhookPayload {
    const parsed = openwaRawSchema.safeParse(rawPayload);
    if (!parsed.success) throw new InvalidPayloadError(parsed.error.message);

    const { data } = parsed;
    return {
      provider: "openwa",
      tenant_whatsapp_number: stripCUsSuffix(data.to),
      from: stripCUsSuffix(data.from),
      message_id: data.id,
      content: data.body,
      media_type: mapMediaType(data.type),
      from_me: data.fromMe,
      timestamp: new Date(data.timestamp * 1000).toISOString(),
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
      throw new Error(`OpenWA: tenant ${params.tenant_id} não está conectado`);
    }
    // ponytail: OpenWA roda embarcado (client.sendText via processo Node próprio, não REST puro)
    // — wire format aqui assume um wrapper HTTP local sobre a instância, não verificado contra
    // deploy real. Ver SYNC REQUESTS no relatório.
    const baseUrl = process.env.OPENWA_API_BASE_URL;
    if (!baseUrl) throw new Error("OPENWA_API_BASE_URL ausente — configure .env.local");

    const response = await fetch(`${baseUrl}/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.credentials_ref}` },
      body: JSON.stringify({ instanceId: connection.instance_id, to: params.to, content: params.content }),
    });
    if (!response.ok) throw new Error(`OpenWA send falhou: HTTP ${response.status}`);
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("OpenWA send: resposta sem message id");
    return { provider_message_id: body.id };
  }

  async status(tenant_id: string): Promise<{ session_status: "conectado" | "desconectado" | "pareando" }> {
    const connection = await this.connectionRepo.getByTenantId(tenant_id);
    return { session_status: connection?.session_status ?? "desconectado" };
  }

  async pareamento(tenant_id: string): Promise<{ qr_code_base64: string } | { status: "ja_pareado" }> {
    const connection = await this.connectionRepo.getByTenantId(tenant_id);
    if (connection?.session_status === "conectado") return { status: "ja_pareado" };

    const baseUrl = process.env.OPENWA_API_BASE_URL;
    if (!baseUrl || !connection) throw new Error("OpenWA: conexão/instância não configurada");

    // ponytail: mesmo caveat de wire format de send() — endpoint hipotético não verificado.
    const response = await fetch(`${baseUrl}/getQrCode`, {
      headers: { Authorization: `Bearer ${connection.credentials_ref}` },
    });
    if (!response.ok) throw new Error(`OpenWA pareamento falhou: HTTP ${response.status}`);
    const body = (await response.json()) as { qr?: string };
    if (!body.qr) throw new Error("OpenWA pareamento: resposta sem QR code");
    return { qr_code_base64: body.qr };
  }
}
