// PUT /api/knowledge-base/:campo — salva como rascunho, nunca publica direto (Requisito 2).
// Corpo da requisição é o próprio `conteudo` (objeto estruturado — instrução+exemplo por campo).
// Controller: resolve tenant_id do JWT, valida Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseKnowledgeEntryRepository } from "@/repositories/knowledge-base.repository";
import { saveKnowledgeDraftSchema } from "@/schemas/knowledge-base.schema";
import { KnowledgeBaseError, knowledgeBaseErrorStatus } from "@/services/knowledge-base.errors";
import { KnowledgeBaseService } from "@/services/knowledge-base.service";

interface RouteContext {
  params: Promise<{ campo: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { campo } = await context.params;

  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  let conteudo: unknown;
  try {
    conteudo = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Corpo da requisição inválido" } }, { status: 400 });
  }

  let parsed;
  try {
    parsed = saveKnowledgeDraftSchema.parse({ tenant_id: resolved.tenantId, campo, conteudo });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Payload inválido", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new KnowledgeBaseService(new SupabaseKnowledgeEntryRepository(createServiceClient()));
    const result = await service.saveKnowledgeDraft(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: knowledgeBaseErrorStatus(error) });
    }
    console.error("[PUT /api/knowledge-base/:campo] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
