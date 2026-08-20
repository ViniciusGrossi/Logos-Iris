import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { OpenWaClient } from "@/lib/openwa.client";
import {
  OpenWaTimeoutError,
  OpenWaMalformedResponseError,
  OpenWaAuthError,
  OpenWaRateLimitError,
  OpenWaNetworkError,
} from "@/lib/openwa.errors";

const FAST_RETRY = { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 50 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenWaClient — hardening fase 9 (gap #1)", () => {
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "OWA-1" }));

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });
    const result = await client.sendText({
      instanceId: "inst-1",
      token: "secret-token",
      to: "5511999998888",
      content: "oi",
    });

    expect(result).toEqual({ messageId: "OWA-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openwa.example.com/sendText",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("cenário timeout: AbortController dispara, retry esgota e lança OpenWaTimeoutError tipado", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const client = new OpenWaClient({
      baseUrl: "https://openwa.example.com",
      retry: { ...FAST_RETRY, timeoutMs: 10 },
    });

    await expect(
      client.sendText({ instanceId: "inst-1", token: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(OpenWaTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("cenário malformado: resposta 200 sem campo id lança OpenWaMalformedResponseError tipado", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: "shape" }));

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", token: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(OpenWaMalformedResponseError);
  });

  it("cenário malformado: corpo não é JSON válido lança OpenWaMalformedResponseError tipado", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } })
    );

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", token: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(OpenWaMalformedResponseError);
  });

  it("edge case: HTTP 403 nunca é retentado — lança OpenWaAuthError tipado direto", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", token: "bad", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(OpenWaAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("edge case: HTTP 429 é retentado e, se persistir, lança OpenWaRateLimitError tipado", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", token: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(OpenWaRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("edge case: falha de rede lança OpenWaNetworkError tipado", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", token: "t", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(OpenWaNetworkError);
  });

  it("getQrCode: cenário sucesso retorna qrCodeBase64", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ qr: "iVBORw0KGgo=" }));

    const client = new OpenWaClient({ baseUrl: "https://openwa.example.com", retry: FAST_RETRY });
    const result = await client.getQrCode({ token: "t" });

    expect(result).toEqual({ qrCodeBase64: "iVBORw0KGgo=" });
  });
});
