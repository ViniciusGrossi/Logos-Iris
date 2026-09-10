// POST /api/knowledge-base/rollback/:versao — restaura uma versão histórica como a publicada atual.
// Controller: resolve tenant_id do JWT, valida Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseKnowledgeEntryRepository } from "@/repositories/knowledge-base.repository";
import { rollbackKnowledgeBaseSchema } from "@/schemas/knowledge-base.schema";
import { KnowledgeBaseError, knowledgeBaseErrorStatus } from "@/services/knowledge-base.errors";
import { KnowledgeBaseService } from "@/services/knowledge-base.service";

interface RouteContext {
  params: Promise<{ versao: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { versao } = await context.params;

  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  let parsed;
  try {
    parsed = rollbackKnowledgeBaseSchema.parse({ tenant_id: resolved.tenantId, versao });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Versão inválida", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new KnowledgeBaseService(new SupabaseKnowledgeEntryRepository(createServiceClient()));
    const result = await service.rollbackKnowledgeBase(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: knowledgeBaseErrorStatus(error) });
    }
    console.error("[POST /api/knowledge-base/rollback/:versao] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
