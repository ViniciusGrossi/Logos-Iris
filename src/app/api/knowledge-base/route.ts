// GET /api/knowledge-base?campo= — Painel Cliente, tenant-scoped (RLS).
// Controller: resolve tenant_id do JWT, valida query com Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseKnowledgeEntryRepository } from "@/repositories/knowledge-base.repository";
import { getKnowledgeBaseQuerySchema } from "@/schemas/knowledge-base.schema";
import { KnowledgeBaseError, knowledgeBaseErrorStatus } from "@/services/knowledge-base.errors";
import { KnowledgeBaseService } from "@/services/knowledge-base.service";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  const campoParam = request.nextUrl.searchParams.get("campo") ?? undefined;

  let parsed;
  try {
    parsed = getKnowledgeBaseQuerySchema.parse({ tenant_id: resolved.tenantId, campo: campoParam });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Query inválida", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new KnowledgeBaseService(new SupabaseKnowledgeEntryRepository(createServiceClient()));
    const items = await service.getKnowledgeBase(parsed);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: knowledgeBaseErrorStatus(error) });
    }
    console.error("[GET /api/knowledge-base] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
