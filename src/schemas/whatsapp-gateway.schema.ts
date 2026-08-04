import { z } from "zod";

// ── Canônico (specs/api.contracts.ts — cópia exata, nunca diverge sem Spec Sync Request) ──

export const whatsAppProviderSchema = z.enum(["evolution", "openwa", "cloud_api"]);
export type WhatsAppProvider = z.infer<typeof whatsAppProviderSchema>;

export const mediaTypeSchema = z.enum(["texto", "audio", "imagem", "documento"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const whatsAppWebhookPayloadSchema = z.object({
  provider: whatsAppProviderSchema,
  tenant_whatsapp_number: z.string().min(1),
  from: z.string().min(1),
  message_id: z.string().min(1),
  content: z.string(),
  media_type: mediaTypeSchema,
  from_me: z.boolean(),
  timestamp: z.string().min(1), // ISODateTime
});
export type WhatsAppWebhookPayload = z.infer<typeof whatsAppWebhookPayloadSchema>;

// ── Raw por provedor — valida só os campos que o adapter lê (trust boundary de entrada) ──
// .passthrough(): cada provedor manda muito mais campo do que usamos; não é nosso papel
// replicar o wire format inteiro, só garantir que o que lemos existe e tem o tipo certo.

// Evolution API (Baileys) — evento "messages.upsert"
export const evolutionRawSchema = z
  .object({
    instance: z.string().min(1),
    sender: z.string().min(1), // número do próprio tenant (business), formato "55...@s.whatsapp.net"
    data: z
      .object({
        key: z
          .object({
            remoteJid: z.string().min(1),
            fromMe: z.boolean(),
            id: z.string().min(1),
          })
          .passthrough(),
        message: z.record(z.string(), z.unknown()).optional(),
        messageType: z.string().min(1),
        messageTimestamp: z.number(),
      })
      .passthrough(),
  })
  .passthrough();
export type EvolutionRawPayload = z.infer<typeof evolutionRawSchema>;

// OpenWA (open-wa/wa-automate) — objeto Message do onMessage/onAnyMessage
export const openwaRawSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1), // "55...@c.us" — número do cliente (mesmo quando fromMe=true)
    to: z.string().min(1), // número do tenant (business)
    body: z.string().default(""),
    type: z.string().min(1),
    timestamp: z.number(),
    fromMe: z.boolean(),
  })
  .passthrough();
export type OpenWaRawPayload = z.infer<typeof openwaRawSchema>;

// WhatsApp Cloud API (Meta) — webhook oficial, shape "entry[].changes[].value"
const cloudApiMessageSchema = z
  .object({
    from: z.string().min(1),
    id: z.string().min(1),
    timestamp: z.string().min(1), // segundos como string (padrão Meta)
    type: z.string().min(1),
    text: z.object({ body: z.string() }).optional(),
  })
  .passthrough();

export const cloudApiRawSchema = z
  .object({
    entry: z
      .array(
        z
          .object({
            changes: z
              .array(
                z
                  .object({
                    value: z
                      .object({
                        metadata: z
                          .object({ display_phone_number: z.string().min(1) })
                          .passthrough(),
                        messages: z.array(cloudApiMessageSchema).min(1),
                      })
                      .passthrough(),
                  })
                  .passthrough()
              )
              .min(1),
          })
          .passthrough()
      )
      .min(1),
  })
  .passthrough();
export type CloudApiRawPayload = z.infer<typeof cloudApiRawSchema>;

// ── Param de rota (:provider) — trust boundary da URL ──
export const providerRouteParamSchema = whatsAppProviderSchema;
