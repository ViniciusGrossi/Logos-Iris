// Client HTTP tipado da Evolution API — hardening fase 9, gap #1: EvolutionAdapter usava fetch()
// cru, sem retry, sem timeout, com throw new Error(...) genérico. Este client centraliza:
// - timeout configurável via AbortController (fetchWithRetry, src/lib/whatsapp-gateway/http-retry.ts)
// - retry com backoff exponencial + jitter em falha de rede/timeout/5xx/429
// - erros tipados por categoria (rede/timeout/auth/rate_limit/malformado/http) — nunca Error genérico
//
// ponytail (herdado do adapter original): wire format do POST /message/sendText/{instance} e
// GET /instance/connect/{instance} da Evolution API v2 (self-hosted) documentado pela Evolution API
// oficial, não verificado end-to-end contra uma instância real aqui. Ver SYNC REQUESTS no relatório.
import {
  fetchWithRetry,
  FetchAttemptError,
  DEFAULT_RETRY_OPTIONS,
  type RetryOptions,
} from "@/lib/whatsapp-gateway/http-retry";
import {
  EvolutionNetworkError,
  EvolutionTimeoutError,
  EvolutionAuthError,
  EvolutionRateLimitError,
  EvolutionMalformedResponseError,
  EvolutionHttpError,
} from "@/lib/evolution.errors";

export interface EvolutionClientConfig {
  baseUrl: string;
  retry?: Partial<RetryOptions>;
}

export interface EvolutionSendTextResult {
  messageId: string;
}

export interface EvolutionPairingResult {
  qrCodeBase64: string;
}

export class EvolutionClient {
  private readonly retryOptions: RetryOptions;

  constructor(private readonly config: EvolutionClientConfig) {
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...config.retry };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchWithRetry(`${this.config.baseUrl}${path}`, init, this.retryOptions);
    } catch (err) {
      if (err instanceof FetchAttemptError) {
        if (err.kind === "timeout") throw new EvolutionTimeoutError(this.retryOptions.timeoutMs);
        throw new EvolutionNetworkError(err.cause);
      }
      throw err;
    }

    if (response.status === 401 || response.status === 403) throw new EvolutionAuthError(response.status);
    if (response.status === 429) throw new EvolutionRateLimitError();
    if (!response.ok) throw new EvolutionHttpError(response.status, response.statusText);

    try {
      return await response.json();
    } catch {
      throw new EvolutionMalformedResponseError("corpo da resposta não é JSON válido");
    }
  }

  async sendText(params: {
    instanceId: string;
    apiKey: string;
    to: string;
    content: string;
  }): Promise<EvolutionSendTextResult> {
    const body = await this.request(`/message/sendText/${params.instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: params.apiKey },
      body: JSON.stringify({ number: params.to, text: params.content }),
    });

    const messageId = (body as { key?: { id?: string } } | null)?.key?.id;
    if (!messageId) throw new EvolutionMalformedResponseError("resposta sem key.id (message id)");
    return { messageId };
  }

  async getConnectionQr(params: { instanceId: string; apiKey: string }): Promise<EvolutionPairingResult> {
    const body = await this.request(`/instance/connect/${params.instanceId}`, {
      method: "GET",
      headers: { apikey: params.apiKey },
    });

    const base64 = (body as { base64?: string } | null)?.base64;
    if (!base64) throw new EvolutionMalformedResponseError("resposta sem campo base64 (QR code)");
    return { qrCodeBase64: base64 };
  }
}
