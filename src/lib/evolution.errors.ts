// Erros tipados do client HTTP da Evolution API — nunca throw genérico (CLAUDE.md: "Falha externa
// nunca vira 500 genérico — erro tipado com mensagem acionável"). Categorias: rede, timeout, auth,
// rate limit, resposta malformada, e HTTP genérico (demais status não-ok).

export abstract class EvolutionClientError extends Error {
  abstract readonly category: "network" | "timeout" | "auth" | "rate_limit" | "malformed" | "http";
}

export class EvolutionNetworkError extends EvolutionClientError {
  readonly category = "network" as const;
  constructor(cause: unknown) {
    super("Evolution API: falha de rede ao chamar o provedor", { cause });
    this.name = "EvolutionNetworkError";
  }
}

export class EvolutionTimeoutError extends EvolutionClientError {
  readonly category = "timeout" as const;
  constructor(timeoutMs: number) {
    super(`Evolution API: timeout após ${timeoutMs}ms sem resposta`);
    this.name = "EvolutionTimeoutError";
  }
}

export class EvolutionAuthError extends EvolutionClientError {
  readonly category = "auth" as const;
  constructor(status: number) {
    super(`Evolution API: credencial rejeitada pelo provedor (HTTP ${status})`);
    this.name = "EvolutionAuthError";
  }
}

export class EvolutionRateLimitError extends EvolutionClientError {
  readonly category = "rate_limit" as const;
  constructor() {
    super("Evolution API: rate limit do provedor excedido (HTTP 429)");
    this.name = "EvolutionRateLimitError";
  }
}

export class EvolutionMalformedResponseError extends EvolutionClientError {
  readonly category = "malformed" as const;
  constructor(reason: string) {
    super(`Evolution API: resposta em formato inesperado — ${reason}`);
    this.name = "EvolutionMalformedResponseError";
  }
}

export class EvolutionHttpError extends EvolutionClientError {
  readonly category = "http" as const;
  constructor(
    public readonly status: number,
    statusText: string
  ) {
    super(`Evolution API: HTTP ${status} ${statusText}`);
    this.name = "EvolutionHttpError";
  }
}
