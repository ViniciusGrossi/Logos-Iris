import { describe, it, expect, beforeEach } from "vitest";

import { checkRateLimit, __resetRateLimiterForTests } from "@/lib/whatsapp-gateway/rate-limiter";

// Hardening fase 9, gap #4 — endpoint webhook não tinha rate limiting nenhum antes. Janela
// deslizante em memória (trade-off single-instance/serverless documentado no próprio módulo).

describe("checkRateLimit — janela deslizante em memória", () => {
  beforeEach(() => {
    __resetRateLimiterForTests();
  });

  it("critério: permite requisições até o limite configurado", () => {
    const config = { windowMs: 1000, maxRequests: 3 };
    const now = 1_000_000;

    expect(checkRateLimit("evolution:1.2.3.4", config, now).allowed).toBe(true);
    expect(checkRateLimit("evolution:1.2.3.4", config, now + 10).allowed).toBe(true);
    expect(checkRateLimit("evolution:1.2.3.4", config, now + 20).allowed).toBe(true);
  });

  it("critério: bloqueia a requisição que excede o limite dentro da janela", () => {
    const config = { windowMs: 1000, maxRequests: 2 };
    const now = 2_000_000;

    checkRateLimit("evolution:1.2.3.4", config, now);
    checkRateLimit("evolution:1.2.3.4", config, now + 10);
    const third = checkRateLimit("evolution:1.2.3.4", config, now + 20);

    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("critério: após a janela expirar, volta a permitir (sliding window, não reset abrupto)", () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    const now = 3_000_000;

    expect(checkRateLimit("evolution:1.2.3.4", config, now).allowed).toBe(true);
    expect(checkRateLimit("evolution:1.2.3.4", config, now + 500).allowed).toBe(false);
    // fora da janela original (now + 1000 já não conta a 1ª requisição)
    expect(checkRateLimit("evolution:1.2.3.4", config, now + 1001).allowed).toBe(true);
  });

  it("edge case: chaves diferentes (provider+IP) têm buckets independentes", () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    const now = 4_000_000;

    expect(checkRateLimit("evolution:1.2.3.4", config, now).allowed).toBe(true);
    // mesmo provider, IP diferente — não compartilha o bucket
    expect(checkRateLimit("evolution:9.9.9.9", config, now).allowed).toBe(true);
    // mesmo IP, provider diferente — também não compartilha
    expect(checkRateLimit("openwa:1.2.3.4", config, now).allowed).toBe(true);
  });

  it("edge case: retryAfterMs reflete o tempo até a requisição mais antiga sair da janela", () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    const now = 5_000_000;

    checkRateLimit("evolution:1.2.3.4", config, now);
    const blocked = checkRateLimit("evolution:1.2.3.4", config, now + 300);

    expect(blocked.retryAfterMs).toBe(700); // 1000 - 300
  });
});
