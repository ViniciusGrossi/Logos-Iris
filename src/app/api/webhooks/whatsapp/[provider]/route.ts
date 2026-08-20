import { NextResponse } from "next/server";
import { providerRouteParamSchema, type WhatsAppProvider } from "@/schemas/whatsapp-gateway.schema";
import { createWhatsAppGatewayService } from "@/services/whatsapp-gateway.factory";
import {
  WhatsAppGatewayError,
  InvalidProviderError,
  InvalidJsonError,
  WebhookAuthError,
  InternalGatewayError,
  RateLimitedError,
} from "@/lib/whatsapp-gateway/errors";
import { verifySharedSecret, verifyMetaSignature } from "@/lib/whatsapp-gateway/webhook-auth";
import { checkRateLimit, type RateLimitConfig } from "@/lib/whatsapp-gateway/rate-limiter";
import { clientIdentifier } from "@/lib/whatsapp-gateway/client-identifier";

// Hardening fase 9, gap #3 — SEGURANÇA: nenhuma parte deste arquivo deve nunca ecoar, logar ou
// persistir o valor de WHATSAPP_WEBHOOK_SECRET/META_APP_SECRET, apikeys, tokens ou qualquer header
// de auth — nem em resposta HTTP, nem em console.log/console.error (incidente registrado em
// STATE-PROJECT.md → Lições, 2026-08-07: um worker anterior ecoou um secret em log/tabela).

// Gap #3: autenticação do webhook — antes fail-open (ausência de WHATSAPP_WEBHOOK_SECRET liberava
// qualquer requisição). Agora fail-closed por padrão. Cloud API (Meta) valida a assinatura nativa
// X-Hub-Signature-256 (HMAC do corpo bruto) quando META_APP_SECRET está configurada — caminho
// preferível porque é por-requisição, não um segredo estático. Sem META_APP_SECRET, cloud_api cai
// no mesmo fallback de segredo compartilhado usado por evolution/openwa (limitação conhecida desses
// dois: self-hosted, sem assinatura nativa documentada neste projeto — ver SYNC REQUESTS).
function verifyWebhookAuth(provider: WhatsAppProvider, req: Request, rawBody: string): boolean {
  if (provider === "cloud_api") {
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      return verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    }
  }

  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  const allowInsecureDev = process.env.WHATSAPP_WEBHOOK_ALLOW_INSECURE_DEV === "true";
  const provided = req.headers.get("x-webhook-secret");
  return verifySharedSecret(provided, expected, allowInsecureDev).ok;
}

// Gap #4: rate limiting básico — janela deslizante em memória, ver trade-off documentado em
// src/lib/whatsapp-gateway/rate-limiter.ts. Chave = provider + IP de origem (best-effort; provedores
// self-hosted/Meta chamam de IPs relativamente estáveis, então isso já discrimina bem tráfego
// anômalo de um único cliente martelando o endpoint).
function rateLimitConfigFromEnv(): RateLimitConfig {
  const maxRequests = Number(process.env.WHATSAPP_WEBHOOK_RATE_LIMIT_MAX ?? "30");
  const windowMs = Number(process.env.WHATSAPP_WEBHOOK_RATE_LIMIT_WINDOW_MS ?? "10000");
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 30,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 10000,
  };
}

function errorResponse(err: WhatsAppGatewayError, headers?: HeadersInit): Response {
  // Nunca vaza stack/detalhe interno na resposta — só code + status (nenhum dado sensível, CLAUDE.md).
  return NextResponse.json({ error: err.code }, { status: err.httpStatus, headers });
}

// Controller — só recebe request, delega pro Service, retorna response. Zero lógica de negócio aqui
// (rate limit/auth são módulos de infra em src/lib/whatsapp-gateway/, não lógica de domínio).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
): Promise<Response> {
  const { provider: rawProvider } = await params;

  const providerResult = providerRouteParamSchema.safeParse(rawProvider);
  if (!providerResult.success) {
    return errorResponse(new InvalidProviderError(rawProvider));
  }
  const provider = providerResult.data;

  const rateLimit = checkRateLimit(`${provider}:${clientIdentifier(req)}`, rateLimitConfigFromEnv());
  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs / 1000);
    return errorResponse(new RateLimitedError(retryAfterSeconds), {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  // Lê o corpo como texto BRUTO antes de qualquer parse: a assinatura HMAC da Meta (X-Hub-Signature-256)
  // é calculada sobre os bytes exatos do corpo, então precisa ser verificada antes do JSON.parse.
  const rawBody = await req.text();

  if (!verifyWebhookAuth(provider, req, rawBody)) {
    return errorResponse(new WebhookAuthError());
  }

  let parsedBody: unknown;
  try {
    parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return errorResponse(new InvalidJsonError());
  }

  try {
    const gateway = createWhatsAppGatewayService();
    const result = await gateway.handleWebhook(provider, parsedBody);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WhatsAppGatewayError) {
      return errorResponse(err);
    }
    // Erro inesperado (DB, rede, etc.) — logado server-side sem conteúdo do payload (pode ter PII
    // do cliente final) para observabilidade, resposta ao provedor não vaza detalhe interno.
    console.error("whatsapp-gateway: erro inesperado", { provider });
    return errorResponse(new InternalGatewayError());
  }
}
