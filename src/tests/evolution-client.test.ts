import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { EvolutionClient } from "@/lib/evolution.client";
import {
  EvolutionTimeoutError,
  EvolutionMalformedResponseError,
  EvolutionAuthError,
  EvolutionRateLimitError,
  EvolutionNetworkError,
} from "@/lib/evolution.errors";

// Retry sem delay real nos testes (baseDelayMs=0 → jitter também vira 0) — os 3 clients (Evolution/
// OpenWA/CloudApi) compartilham o mesmo helper de retry (http-retry.ts), então o padrão de teste é
// idêntico nos 3 arquivos de teste.
const FAST_RETRY = { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 50 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EvolutionClient — hardening fase 9 (gap #1)", () => {
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ key: { id: "EVO-1" } }));

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });
    const result = await client.sendText({
      instanceId: "inst-1",
      apiKey: "secret-key",
      to: "5511999998888",
      content: "oi",
    });

    expect(result).toEqual({ messageId: "EVO-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://evo.example.com/message/sendText/inst-1",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("cenário timeout: AbortController dispara, retry esgota e lança EvolutionTimeoutError tipado", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const client = new EvolutionClient({
      baseUrl: "https://evo.example.com",
      retry: { ...FAST_RETRY, timeoutMs: 10 },
    });

    await expect(
      client.sendText({ instanceId: "inst-1", apiKey: "k", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(EvolutionTimeoutError);

    // maxRetries=2 → até 3 tentativas
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("cenário timeout: retry se recupera — 1a tentativa aborta, 2a tem sucesso", async () => {
    let call = 0;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      return Promise.resolve(jsonResponse({ key: { id: "EVO-2" } }));
    });

    const client = new EvolutionClient({
      baseUrl: "https://evo.example.com",
      retry: { ...FAST_RETRY, timeoutMs: 10 },
    });

    const result = await client.sendText({ instanceId: "inst-1", apiKey: "k", to: "55119999", content: "oi" });
    expect(result).toEqual({ messageId: "EVO-2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cenário malformado: resposta 200 sem key.id lança EvolutionMalformedResponseError tipado", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: "shape" }));

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", apiKey: "k", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(EvolutionMalformedResponseError);
  });

  it("cenário malformado: corpo não é JSON válido lança EvolutionMalformedResponseError tipado", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>not json</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    );

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", apiKey: "k", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(EvolutionMalformedResponseError);
  });

  it("edge case: HTTP 401 nunca é retentado — lança EvolutionAuthError tipado direto", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", apiKey: "bad-key", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(EvolutionAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem retry em erro de auth
  });

  it("edge case: HTTP 429 é retentado e, se persistir, lança EvolutionRateLimitError tipado", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", apiKey: "k", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(EvolutionRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // retentou até esgotar
  });

  it("edge case: falha de rede (fetch rejeita sem AbortError) lança EvolutionNetworkError tipado", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });

    await expect(
      client.sendText({ instanceId: "inst-1", apiKey: "k", to: "55119999", content: "oi" })
    ).rejects.toBeInstanceOf(EvolutionNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("getConnectionQr: cenário sucesso retorna qrCodeBase64", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ base64: "iVBORw0KGgo=" }));

    const client = new EvolutionClient({ baseUrl: "https://evo.example.com", retry: FAST_RETRY });
    const result = await client.getConnectionQr({ instanceId: "inst-1", apiKey: "k" });

    expect(result).toEqual({ qrCodeBase64: "iVBORw0KGgo=" });
  });
});
