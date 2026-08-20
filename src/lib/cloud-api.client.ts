// Client HTTP tipado da WhatsApp Cloud API (Meta) — hardening fase 9, gap #1: CloudApiAdapter usava
// fetch() cru, sem retry, sem timeout, com throw new Error(...) genérico. Mesmo padrão de
// evolution.client.ts: timeout via AbortController + retry backoff/jitter (fetchWithRetry) + erros
// tipados por categoria.
//
// ponytail (herdado do adapter original): shape da Graph API real (POST /{phone_number_id}/messages)
// documentado pela Meta, não verificado end-to-end sem token/WABA real disponível aqui. Ver SYNC
// REQUESTS no relatório.
import {
  fetchWithRetry,
  FetchAttemptError,
  DEFAULT_RETRY_OPTIONS,
  type RetryOptions,
} from "@/lib/whatsapp-gateway/http-retry";
import {
  CloudApiNetworkError,
  CloudApiTimeoutError,
  CloudApiAuthError,
  CloudApiRateLimitError,
  CloudApiMalformedResponseError,
  CloudApiHttpError,
} from "@/lib/cloud-api.errors";

const DEFAULT_GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";

export interface CloudApiClientConfig {
  /** Override só para testes — produção usa sempre a Graph API oficial da Meta. */
  baseUrl?: string;
  retry?: Partial<RetryOptions>;
}

export interface CloudApiSendTextResult {
  messageId: string;
}

export class CloudApiClient {
  private readonly baseUrl: string;
  private readonly retryOptions: RetryOptions;

  constructor(config: CloudApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_GRAPH_API_BASE_URL;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...config.retry };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchWithRetry(`${this.baseUrl}${path}`, init, this.retryOptions);
    } catch (err) {
      if (err instanceof FetchAttemptError) {
        if (err.kind === "timeout") throw new CloudApiTimeoutError(this.retryOptions.timeoutMs);
        throw new CloudApiNetworkError(err.cause);
      }
      throw err;
    }

    if (response.status === 401 || response.status === 403) throw new CloudApiAuthError(response.status);
    if (response.status === 429) throw new CloudApiRateLimitError();
    if (!response.ok) throw new CloudApiHttpError(response.status, response.statusText);

    try {
      return await response.json();
    } catch {
      throw new CloudApiMalformedResponseError("corpo da resposta não é JSON válido");
    }
  }

  async sendText(params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    content: string;
  }): Promise<CloudApiSendTextResult> {
    const body = await this.request(`/${params.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.accessToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: { body: params.content },
      }),
    });

    const messageId = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
    if (!messageId) throw new CloudApiMalformedResponseError("resposta sem messages[0].id");
    return { messageId };
  }
}
