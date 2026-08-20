// Erros tipados do client HTTP da WhatsApp Cloud API (Meta) — espelha evolution.errors.ts
// (mesmo padrão de categorias: rede/timeout/auth/rate_limit/malformado/http). Nunca throw genérico.

export abstract class CloudApiClientError extends Error {
  abstract readonly category: "network" | "timeout" | "auth" | "rate_limit" | "malformed" | "http";
}

export class CloudApiNetworkError extends CloudApiClientError {
  readonly category = "network" as const;
  constructor(cause: unknown) {
    super("Cloud API: falha de rede ao chamar a Graph API da Meta", { cause });
    this.name = "CloudApiNetworkError";
  }
}

export class CloudApiTimeoutError extends CloudApiClientError {
  readonly category = "timeout" as const;
  constructor(timeoutMs: number) {
    super(`Cloud API: timeout após ${timeoutMs}ms sem resposta`);
    this.name = "CloudApiTimeoutError";
  }
}

export class CloudApiAuthError extends CloudApiClientError {
  readonly category = "auth" as const;
  constructor(status: number) {
    super(`Cloud API: token de acesso rejeitado pela Meta (HTTP ${status})`);
    this.name = "CloudApiAuthError";
  }
}

// Meta aplica rate limit oficial por conversa/24h e por tier de negócio (ver spec, tabela
// "Tokens e APIs Externas") — categoria própria porque, diferente de rede/timeout, o caller pode
// querer decidir não fazer retry imediato (ex.: backoff mais agressivo ou fila).
export class CloudApiRateLimitError extends CloudApiClientError {
  readonly category = "rate_limit" as const;
  constructor() {
    super("Cloud API: rate limit da Meta excedido (HTTP 429)");
    this.name = "CloudApiRateLimitError";
  }
}

export class CloudApiMalformedResponseError extends CloudApiClientError {
  readonly category = "malformed" as const;
  constructor(reason: string) {
    super(`Cloud API: resposta em formato inesperado — ${reason}`);
    this.name = "CloudApiMalformedResponseError";
  }
}

export class CloudApiHttpError extends CloudApiClientError {
  readonly category = "http" as const;
  constructor(
    public readonly status: number,
    statusText: string
  ) {
    super(`Cloud API: HTTP ${status} ${statusText}`);
    this.name = "CloudApiHttpError";
  }
}
