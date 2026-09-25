import type { WhatsAppGatewayAdapter, WhatsAppWebhookPayload, MediaType } from "./types";
import type { WhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import { cloudApiRawSchema } from "@/schemas/whatsapp-gateway.schema";
import { InvalidPayloadError } from "@/lib/whatsapp-gateway/errors";
import { CloudApiClient } from "@/lib/cloud-api.client";

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function mapMediaType(type: string): MediaType {
  switch (type) {
    case "text":
      return "texto";
    case "audio":
      return "audio";
    case "image":
      return "imagem";
    case "document":
      return "documento";
    default:
      // ponytail: tipo Cloud API não mapeado (location/contacts/interactive/...) — trata como texto.
      return "texto";
  }
}

// WhatsApp Cloud API (Meta) — webhook oficial entry[].changes[].value.
// ponytail: Cloud API não emite um campo `from_me` nativo (não é Baileys) — sem "message echoes"
// habilitado no app Meta, a API oficial não retorna webhook para mensagens enviadas via ela mesma.
// Heurística aqui: from_me=true quando messages[].from bate com metadata.display_phone_number
// (a própria linha do tenant) — cobre o caso de "echo" se/quando o app tiver esse recurso habilitado.
// Ceiling documentado: verificar contra uma WABA real antes do primeiro pareamento Cloud API em
// produção (ver SYNC REQUESTS no relatório).
export class CloudApiAdapter implements WhatsAppGatewayAdapter {
  constructor(
    private readonly connectionRepo: WhatsAppConnectionRepository,
    // Injeção opcional p/ teste — mesma decisão de EvolutionAdapter/OpenWaAdapter.
    private readonly clientOverride?: CloudApiClient
  ) {}

  private resolveClient(): CloudApiClient {
    return this.clientOverride ?? new CloudApiClient();
  }

  receive(rawPayload: unknown): WhatsAppWebhookPayload {
    const parsed = cloudApiRawSchema.safeParse(rawPayload);
    if (!parsed.success) throw new InvalidPayloadError(parsed.error.message);

    const value = parsed.data.entry[0].changes[0].value;
    const message = value.messages[0];
    const businessNumber = normalizeDigits(value.metadata.display_phone_number);
    const fromNumber = normalizeDigits(message.from);

    return {
      provider: "cloud_api",
      tenant_whatsapp_number: businessNumber,
      from: fromNumber,
      message_id: message.id,
      content: message.text?.body ?? "",
      media_type: mapMediaType(message.type),
      from_me: fromNumber === businessNumber,
      timestamp: new Date(Number(message.timestamp) * 1000).toISOString(),
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
      throw new Error(`Cloud API: tenant ${params.tenant_id} não está conectado`);
    }
    // ALTO-2 (fix 0024): credencial resolvida via Vault sob demanda, só aqui onde é de fato usada.
    const accessToken = await this.connectionRepo.resolveCredentials(params.tenant_id);
    // ponytail: Graph API real (POST /{phone_number_id}/messages) — shape correto documentado
    // pela Meta, mas sem token/WABA real disponível pra verificar end-to-end aqui.
    // Hardening fase 9 (gap #1): antes fetch() cru sem retry/timeout/erro tipado — agora via
    // CloudApiClient (mesmo padrão do EvolutionClient/OpenWaClient).
    const { messageId } = await this.resolveClient().sendText({
      phoneNumberId: connection.instance_id,
      accessToken,
      to: params.to,
      content: params.content,
    });
    return { provider_message_id: messageId };
  }

  async status(tenant_id: string): Promise<{ session_status: "conectado" | "desconectado" | "pareando" }> {
    const connection = await this.connectionRepo.getByTenantId(tenant_id);
    return { session_status: connection?.session_status ?? "desconectado" };
  }

  async pareamento(tenant_id: string): Promise<{ qr_code_base64: string } | { status: "ja_pareado" }> {
    const connection = await this.connectionRepo.getByTenantId(tenant_id);
    if (connection?.session_status === "conectado") return { status: "ja_pareado" };
    // Cloud API é OAuth/embedded-signup, não tem conceito de QR code (diferente de Evolution/OpenWA
    // que são Baileys/pareamento por QR). Sem pareamento ativo, é erro de configuração, não um
    // estado "aguardando QR" — reportado como erro tipado em vez de inventar um QR inexistente.
    throw new Error(
      `Cloud API: tenant ${tenant_id} não está pareado — pareamento é via OAuth/embedded signup Meta, não QR code`
    );
  }
}
