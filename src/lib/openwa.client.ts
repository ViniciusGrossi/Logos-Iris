// Client HTTP tipado da OpenWA — hardening fase 9, gap #1: OpenWaAdapter usava fetch() cru, sem
// retry, sem timeout, com throw new Error(...) genérico. Mesmo padrão de evolution.client.ts:
// timeout via AbortController + retry backoff/jitter (fetchWithRetry) + erros tipados por categoria.
//
// ponytail (herdado do adapter original): OpenWA roda embarcado (client.sendText via processo Node
// próprio, não REST puro) — wire format aqui assume um wrapper HTTP local sobre a instância, não
// verificado contra deploy real. Ver SYNC REQUESTS no relatório.
import {
  fetchWithRetry,
  FetchAttemptError,
  DEFAULT_RETRY_OPTIONS,
  type RetryOptions,
} from "@/lib/whatsapp-gateway/http-retry";
import {
  OpenWaNetworkError,
  OpenWaTimeoutError,
  OpenWaAuthError,
  OpenWaRateLimitError,
  OpenWaMalformedResponseError,
  OpenWaHttpError,
} from "@/lib/openwa.errors";

export interface OpenWaClientConfig {
  baseUrl: string;
  retry?: Partial<RetryOptions>;
}

export interface OpenWaSendTextResult {
  messageId: string;
}

export interface OpenWaPairingResult {
  qrCodeBase64: string;
}

export class OpenWaClient {
  private readonly retryOptions: RetryOptions;

  constructor(private readonly config: OpenWaClientConfig) {
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...config.retry };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchWithRetry(`${this.config.baseUrl}${path}`, init, this.retryOptions);
    } catch (err) {
      if (err instanceof FetchAttemptError) {
        if (err.kind === "timeout") throw new OpenWaTimeoutError(this.retryOptions.timeoutMs);
        throw new OpenWaNetworkError(err.cause);
      }
      throw err;
    }

    if (response.status === 401 || response.status === 403) throw new OpenWaAuthError(response.status);
    if (response.status === 429) throw new OpenWaRateLimitError();
    if (!response.ok) throw new OpenWaHttpError(response.status, response.statusText);

    try {
      return await response.json();
    } catch {
      throw new OpenWaMalformedResponseError("corpo da resposta não é JSON válido");
    }
  }

  async sendText(params: {
    instanceId: string;
    token: string;
    to: string;
    content: string;
  }): Promise<OpenWaSendTextResult> {
    const body = await this.request("/sendText", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
      body: JSON.stringify({ instanceId: params.instanceId, to: params.to, content: params.content }),
    });

    const messageId = (body as { id?: string } | null)?.id;
    if (!messageId) throw new OpenWaMalformedResponseError("resposta sem campo id (message id)");
    return { messageId };
  }

  async getQrCode(params: { token: string }): Promise<OpenWaPairingResult> {
    const body = await this.request("/getQrCode", {
      method: "GET",
      headers: { Authorization: `Bearer ${params.token}` },
    });

    const qr = (body as { qr?: string } | null)?.qr;
    if (!qr) throw new OpenWaMalformedResponseError("resposta sem campo qr (QR code)");
    return { qrCodeBase64: qr };
  }
}
