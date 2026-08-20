import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { CloudApiClient } from "@/lib/cloud-api.client";
import {
  CloudApiTimeoutError,
  CloudApiMalformedResponseError,
  CloudApiAuthError,
  CloudApiRateLimitError,
  CloudApiNetworkError,
} from "@/lib/cloud-api.errors";

const FAST_RETRY = { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 50 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CloudApiClient — hardening fase 9 (gap #1)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("cenário sucesso: sendText resolve com messageId no primeiro try, sem retry", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "wamid.CLOUD-1" }] }));

    const client = new CloudApiClient({ baseUrl: "https://graph.example.com", retry: FAST_RETRY });
    const result = await client.sendText({
      phoneNumberId: "phone-1",
      accessToken: "secret-token",
      to: "5511999998888",
      content: "oi",
    });

    expect(result).toEqual({ messageId: "wamid.CLOUD-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.example.com/phone-1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("cenário timeout: AbortController dispara, retry esgota e lança CloudApiTimeoutError tipado", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const client = new CloudApiClient({
      baseUrl: "https://graph.example.com",
      retry: { ...FAST_RETRY, timeoutMs: 10 },
    });

    await expect(
      client.sendText({ phoneNumberId: "p1", accessToken: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(CloudApiTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("cenário malformado: resposta 200 sem messages[0].id lança CloudApiMalformedResponseError tipado", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: "shape" }));

    const client = new CloudApiClient({ baseUrl: "https://graph.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ phoneNumberId: "p1", accessToken: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(CloudApiMalformedResponseError);
  });

  it("cenário malformado: corpo não é JSON válido lança CloudApiMalformedResponseError tipado", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>error</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    );

    const client = new CloudApiClient({ baseUrl: "https://graph.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ phoneNumberId: "p1", accessToken: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(CloudApiMalformedResponseError);
  });

  it("edge case: HTTP 401 (token Meta inválido) nunca é retentado — lança CloudApiAuthError tipado direto", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const client = new CloudApiClient({ baseUrl: "https://graph.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ phoneNumberId: "p1", accessToken: "bad", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(CloudApiAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("edge case: HTTP 429 (rate limit oficial Meta) é retentado e, se persistir, lança CloudApiRateLimitError tipado", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));

    const client = new CloudApiClient({ baseUrl: "https://graph.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ phoneNumberId: "p1", accessToken: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(CloudApiRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("edge case: falha de rede lança CloudApiNetworkError tipado", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const client = new CloudApiClient({ baseUrl: "https://graph.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ phoneNumberId: "p1", accessToken: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(CloudApiNetworkError);
  });

  it("usa a Graph API oficial da Meta por padrão quando nenhum baseUrl é injetado", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "wamid.X" }] }));

    const client = new CloudApiClient({ retry: FAST_RETRY });
    await client.sendText({ phoneNumberId: "p1", accessToken: "t", to: "5511999998888", content: "oi" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/p1/messages",
      expect.anything()
    );
  });
});
