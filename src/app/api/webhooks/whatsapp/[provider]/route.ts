import { NextResponse } from "next/server";
import { providerRouteParamSchema } from "@/schemas/whatsapp-gateway.schema";
import { createWhatsAppGatewayService } from "@/services/whatsapp-gateway.factory";
import {
  WhatsAppGatewayError,
  InvalidProviderError,
  InvalidJsonError,
  WebhookAuthError,
  InternalGatewayError,
} from "@/lib/whatsapp-gateway/errors";

// ponytail: segredo estático por servidor (não per-tenant) — bloqueia tráfego não autenticado na
// rota antes de qualquer processamento no banco. Verificação per-tenant via credencial do provedor
// exigiria decrypt de credentials_ref (Supabase Vault) ANTES de saber o tenant — problema de ordem
// que esta spec não resolve (precisamos do payload pra achar o tenant, e do tenant pra achar a
// credencial). Ver SYNC REQUESTS no relatório se o requisito precisar subir pra per-tenant.
function verifyWebhookSecret(req: Request): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) return true; // sem segredo configurado (dev local) — não bloqueia
  return req.headers.get("x-webhook-secret") === expected;
}

function errorResponse(err: WhatsAppGatewayError): Response {
  // Nunca vaza stack/detalhe interno na resposta — só code + status (nenhum dado sensível, CLAUDE.md).
  return NextResponse.json({ error: err.code }, { status: err.httpStatus });
}

// Controller — só recebe request, delega pro Service, retorna response. Zero lógica de negócio aqui.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
): Promise<Response> {
  const { provider: rawProvider } = await params;

  const providerResult = providerRouteParamSchema.safeParse(rawProvider);
  if (!providerResult.success) {
    return errorResponse(new InvalidProviderError(rawProvider));
  }

  if (!verifyWebhookSecret(req)) {
    return errorResponse(new WebhookAuthError());
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(new InvalidJsonError());
  }

  try {
    const gateway = createWhatsAppGatewayService();
    const result = await gateway.handleWebhook(providerResult.data, rawBody);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WhatsAppGatewayError) {
      return errorResponse(err);
    }
    // Erro inesperado (DB, rede, etc.) — logado server-side sem conteúdo do payload (pode ter PII
    // do cliente final) para observabilidade, resposta ao provedor não vaza detalhe interno.
    console.error("whatsapp-gateway: erro inesperado", { provider: providerResult.data });
    return errorResponse(new InternalGatewayError());
  }
}
