// Hardening fase 9, gap #3 — autenticação do webhook. Extraído de route.ts (era lógica de negócio
// dentro do Controller, violando C→S→R) e trocado de fail-open pra fail-closed por padrão.
//
// Antes: `verifyWebhookSecret` retornava `true` quando WHATSAPP_WEBHOOK_SECRET não estava setada —
// ou seja, ausência de config = webhook aberto pra qualquer requisição. Isso é o oposto do que se
// espera de um secret de segurança (ausência deveria bloquear, não liberar).
//
// Agora:
// - Sem segredo configurado → REJEITA por padrão (fail-closed).
// - Escape hatch explícito e nomeado só pra dev local: WHATSAPP_WEBHOOK_ALLOW_INSECURE_DEV=true.
//   Não usamos NODE_ENV pra decidir isso: depender de NODE_ENV é frágil (staging às vezes roda com
//   NODE_ENV=production por config de deploy, e o inverso também acontece) — uma flag nomeada exige
//   opt-in consciente de quem sobe o ambiente, não uma inferência.
// - Cloud API (Meta) tem um caminho de validação nativa melhor: X-Hub-Signature-256 é HMAC-SHA256
//   do corpo bruto com o App Secret do app Meta — dá pra validar ANTES de resolver tenant, porque a
//   assinatura é sobre o payload inteiro, não depende de já saber quem é o tenant. Evolution/OpenWA
//   self-hosted não têm um equivalente nativo documentado neste projeto — continuam no segredo
//   compartilhado por servidor (limitação conhecida, registrada como Sync Request candidata no
//   relatório: idealmente seria segredo por-tenant, mas isso exige decrypt de credentials_ref do
//   Supabase Vault ANTES de saber o tenant, problema de ordem que esta spec não resolve).
//
// SEGURANÇA: nenhuma função aqui deve nunca logar, ecoar ou persistir o valor do segredo ou do
// header de auth — só o resultado booleano da comparação (ver incidente registrado em
// STATE-PROJECT.md → Lições, 2026-08-07).

import { createHmac, timingSafeEqual } from "node:crypto";

export type SharedSecretAuthFailureReason = "missing_secret_fail_closed" | "secret_mismatch";

export interface SharedSecretAuthResult {
  ok: boolean;
  reason?: SharedSecretAuthFailureReason;
}

/** Comparação em tempo constante — evita vazar por timing quanto do segredo bateu. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // ainda consome um timingSafeEqual (contra um buffer do mesmo tamanho de bufA) pra não
    // retornar imediatamente em tempo variável só por causa do length-check.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function verifySharedSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined,
  allowInsecureDev: boolean
): SharedSecretAuthResult {
  if (!expectedSecret) {
    return allowInsecureDev ? { ok: true } : { ok: false, reason: "missing_secret_fail_closed" };
  }
  if (!providedSecret || !timingSafeEqualStrings(providedSecret, expectedSecret)) {
    return { ok: false, reason: "secret_mismatch" };
  }
  return { ok: true };
}

/**
 * Valida X-Hub-Signature-256 (Meta) — HMAC-SHA256 do corpo BRUTO (string, antes de JSON.parse)
 * com o App Secret do app Meta. Formato do header: "sha256=<hex>".
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const providedHex = signatureHeader.slice("sha256=".length);
  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqualStrings(providedHex, expectedHex);
}
