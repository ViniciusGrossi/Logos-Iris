// Hardening fase 9 (gap #1/#2) — helper HTTP compartilhado pelos 3 clients de provedor
// (evolution.client.ts, openwa.client.ts, cloud-api.client.ts). Cada client mantém seus PRÓPRIOS
// erros tipados por categoria (ver *.errors.ts ao lado de cada client) — este módulo só resolve o
// mecanismo comum (timeout via AbortController + retry com backoff exponencial e jitter) para não
// triplicar a mesma lógica de baixo nível em 3 arquivos.

export type FetchFailureKind = "network" | "timeout";

/** Erro de transporte (nunca chegou a ter um status HTTP) — o client concreto mapeia pro seu erro tipado. */
export class FetchAttemptError extends Error {
  constructor(
    public readonly kind: FetchFailureKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "FetchAttemptError";
  }
}

export interface RetryOptions {
  /** Tentativas adicionais além da primeira (maxRetries=2 → até 3 chamadas no total). */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  /** Decide se um status HTTP não-ok merece retry (default: 429 e 5xx). */
  retryOnStatus?: (status: number) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 2000,
  timeoutMs: 8000,
};

function shouldRetryStatus(status: number, opts: RetryOptions): boolean {
  if (opts.retryOnStatus) return opts.retryOnStatus(status);
  return status === 429 || status >= 500;
}

// Full jitter (AWS Architecture Blog): delay = random(0, min(maxDelay, base * 2^attempt)).
// Evita "thundering herd" quando várias chamadas falham juntas (ex.: instância Evolution reiniciando).
function backoffWithJitter(attempt: number, opts: RetryOptions): number {
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch com timeout (AbortController) + retry exponencial com jitter.
 * Não interpreta o corpo da resposta — devolve o Response cru (ok ou não) pro client tipar o erro
 * de categoria certa (auth/malformado/http). Erros de rede/timeout nunca escapam como Error genérico:
 * sempre viram FetchAttemptError com `kind` definido.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  opts: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<Response> {
  let lastError: FetchAttemptError | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok && shouldRetryStatus(response.status, opts) && attempt < opts.maxRetries) {
        await sleep(backoffWithJitter(attempt, opts));
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = new FetchAttemptError(
        isAbort ? "timeout" : "network",
        isAbort
          ? `timeout após ${opts.timeoutMs}ms sem resposta`
          : `falha de rede: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
      if (attempt < opts.maxRetries) {
        await sleep(backoffWithJitter(attempt, opts));
        continue;
      }
    }
  }

  throw lastError ?? new FetchAttemptError("network", "falha desconhecida ao chamar o provedor");
}
