// Erros tipados do whatsapp-gateway — nunca throw genérico/raw 500 (CLAUDE.md).
// Controller mapeia cada subclasse pro status HTTP certo; nenhuma stack/detalhe interno vaza na resposta.

export abstract class WhatsAppGatewayError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;
}

export class InvalidProviderError extends WhatsAppGatewayError {
  readonly httpStatus = 400;
  readonly code = "invalid_provider";
  constructor(received: string) {
    super(`Provider de rota inválido: "${received}"`);
    this.name = "InvalidProviderError";
  }
}

export class InvalidPayloadError extends WhatsAppGatewayError {
  readonly httpStatus = 400;
  readonly code = "invalid_payload";
  constructor(reason: string) {
    super(`Payload de webhook inválido: ${reason}`);
    this.name = "InvalidPayloadError";
  }
}

export class WebhookAuthError extends WhatsAppGatewayError {
  readonly httpStatus = 401;
  readonly code = "webhook_auth_failed";
  constructor() {
    super("Assinatura/token do webhook não confere");
    this.name = "WebhookAuthError";
  }
}

export class UnknownTenantError extends WhatsAppGatewayError {
  readonly httpStatus = 202; // ack mesmo assim (provedor não pode ficar retry-storming) — ver DESVIO no relatório
  readonly code = "unknown_tenant";
  constructor() {
    super("Nenhum tenant corresponde ao número de WhatsApp do payload");
    this.name = "UnknownTenantError";
  }
}

export class InvalidJsonError extends WhatsAppGatewayError {
  readonly httpStatus = 400;
  readonly code = "invalid_json";
  constructor() {
    super("Corpo da requisição não é JSON válido");
    this.name = "InvalidJsonError";
  }
}

export class InternalGatewayError extends WhatsAppGatewayError {
  readonly httpStatus = 500;
  readonly code = "internal_error";
  constructor() {
    super("Erro interno ao processar o webhook");
    this.name = "InternalGatewayError";
  }
}
