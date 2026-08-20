// Erros tipados do client HTTP da OpenWA — espelha evolution.errors.ts (mesmo padrão de
// categorias: rede/timeout/auth/rate_limit/malformado/http). Nunca throw genérico.

export abstract class OpenWaClientError extends Error {
  abstract readonly category: "network" | "timeout" | "auth" | "rate_limit" | "malformed" | "http";
}

export class OpenWaNetworkError extends OpenWaClientError {
  readonly category = "network" as const;
  constructor(cause: unknown) {
    super("OpenWA: falha de rede ao chamar o provedor", { cause });
    this.name = "OpenWaNetworkError";
  }
}

export class OpenWaTimeoutError extends OpenWaClientError {
  readonly category = "timeout" as const;
  constructor(timeoutMs: number) {
    super(`OpenWA: timeout após ${timeoutMs}ms sem resposta`);
    this.name = "OpenWaTimeoutError";
  }
}

export class OpenWaAuthError extends OpenWaClientError {
  readonly category = "auth" as const;
  constructor(status: number) {
    super(`OpenWA: credencial rejeitada pelo provedor (HTTP ${status})`);
    this.name = "OpenWaAuthError";
  }
}

export class OpenWaRateLimitError extends OpenWaClientError {
  readonly category = "rate_limit" as const;
  constructor() {
    super("OpenWA: rate limit do provedor excedido (HTTP 429)");
    this.name = "OpenWaRateLimitError";
  }
}

export class OpenWaMalformedResponseError extends OpenWaClientError {
  readonly category = "malformed" as const;
  constructor(reason: string) {
    super(`OpenWA: resposta em formato inesperado — ${reason}`);
    this.name = "OpenWaMalformedResponseError";
  }
}

export class OpenWaHttpError extends OpenWaClientError {
  readonly category = "http" as const;
  constructor(
    public readonly status: number,
    statusText: string
  ) {
    super(`OpenWA: HTTP ${status} ${statusText}`);
    this.name = "OpenWaHttpError";
  }
}
