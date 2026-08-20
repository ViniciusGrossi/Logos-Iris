import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

import { verifySharedSecret, verifyMetaSignature } from "@/lib/whatsapp-gateway/webhook-auth";

// Hardening fase 9, gap #3 — antes verifyWebhookSecret era fail-open (sem WHATSAPP_WEBHOOK_SECRET
// configurada, liberava qualquer requisição). Estes testes provam o comportamento fail-closed novo.

describe("verifySharedSecret — fail-closed por padrão", () => {
  it("critério: sem segredo esperado configurado E sem escape hatch → REJEITA (fail-closed)", () => {
    const result = verifySharedSecret("qualquer-coisa", undefined, false);
    expect(result).toEqual({ ok: false, reason: "missing_secret_fail_closed" });
  });

  it("critério: sem segredo esperado configurado MAS com escape hatch dev explícito → libera", () => {
    const result = verifySharedSecret(null, undefined, true);
    expect(result).toEqual({ ok: true });
  });

  it("critério: segredo configurado e header bate → libera", () => {
    const result = verifySharedSecret("meu-segredo-123", "meu-segredo-123", false);
    expect(result).toEqual({ ok: true });
  });

  it("critério: segredo configurado e header não bate → rejeita com secret_mismatch", () => {
    const result = verifySharedSecret("valor-errado", "meu-segredo-123", false);
    expect(result).toEqual({ ok: false, reason: "secret_mismatch" });
  });

  it("edge case: segredo configurado mas header ausente (null) → rejeita", () => {
    const result = verifySharedSecret(null, "meu-segredo-123", false);
    expect(result.ok).toBe(false);
  });

  it("edge case: header e segredo com tamanhos diferentes não lançam exceção (comparação segura)", () => {
    expect(() => verifySharedSecret("curto", "um-segredo-bem-mais-longo-que-isso", false)).not.toThrow();
    expect(verifySharedSecret("curto", "um-segredo-bem-mais-longo-que-isso", false).ok).toBe(false);
  });
});

describe("verifyMetaSignature — X-Hub-Signature-256 (HMAC do corpo bruto)", () => {
  const appSecret = "meta-app-secret-de-teste";
  const rawBody = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });

  function validSignatureFor(body: string, secret: string): string {
    return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  }

  it("critério: assinatura válida (HMAC do corpo bruto com o app secret correto) → aceita", () => {
    const signature = validSignatureFor(rawBody, appSecret);
    expect(verifyMetaSignature(rawBody, signature, appSecret)).toBe(true);
  });

  it("critério: assinatura calculada com secret errado → rejeita", () => {
    const signature = validSignatureFor(rawBody, "secret-errado");
    expect(verifyMetaSignature(rawBody, signature, appSecret)).toBe(false);
  });

  it("critério: corpo alterado após a assinatura ser calculada → rejeita (prova que valida o corpo bruto)", () => {
    const signature = validSignatureFor(rawBody, appSecret);
    const tamperedBody = rawBody.replace("messages", "mutated");
    expect(verifyMetaSignature(tamperedBody, signature, appSecret)).toBe(false);
  });

  it("edge case: header ausente → rejeita sem lançar", () => {
    expect(verifyMetaSignature(rawBody, null, appSecret)).toBe(false);
  });

  it("edge case: header sem prefixo sha256= → rejeita", () => {
    expect(verifyMetaSignature(rawBody, "abcdef1234", appSecret)).toBe(false);
  });
});
