// GET /api/conversations/:id/messages?page=&limit= — histórico paginado (Requisito 2).
// Controller: resolve tenant_id do JWT, valida Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseConversationSummaryRepository } from "@/repositories/conversation-summary.repository";
import { getConversationMessagesQuerySchema } from "@/schemas/conversation-summary.schema";
import { InboxError, inboxErrorStatus } from "@/services/inbox.errors";
import { InboxService } from "@/services/inbox.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  const search = request.nextUrl.searchParams;

  let parsed;
  try {
    parsed = getConversationMessagesQuerySchema.parse({
      tenant_id: resolved.tenantId,
      conversation_id: id,
      page: search.get("page") ?? undefined,
      limit: search.get("limit") ?? undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Query inválida", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new InboxService(new SupabaseConversationSummaryRepository(createServiceClient()));
    const result = await service.getConversationMessages(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InboxError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: inboxErrorStatus(error) });
    }
    console.error("[GET /api/conversations/:id/messages] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
