// POST /api/knowledge-base/playground — testa uma mensagem simulada contra o RASCUNHO atual, sem
// afetar produção nem enviar mensagem real ao cliente final (Requisito 7).
// Controller: resolve tenant_id do JWT, valida Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseKnowledgeEntryRepository } from "@/repositories/knowledge-base.repository";
import { testPlaygroundSchema } from "@/schemas/knowledge-base.schema";
import { KnowledgeBaseError, knowledgeBaseErrorStatus } from "@/services/knowledge-base.errors";
import { KnowledgeBaseService } from "@/services/knowledge-base.service";

export async function POST(request: Request) {
  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Corpo da requisição inválido" } }, { status: 400 });
  }

  const rawBody = (body ?? {}) as Record<string, unknown>;

  let parsed;
  try {
    parsed = testPlaygroundSchema.parse({
      tenant_id: resolved.tenantId,
      mensagem_simulada: rawBody.mensagem_simulada,
      persona: rawBody.persona,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Payload inválido", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new KnowledgeBaseService(new SupabaseKnowledgeEntryRepository(createServiceClient()));
    const result = await service.testPlayground(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: knowledgeBaseErrorStatus(error) });
    }
    console.error("[POST /api/knowledge-base/playground] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
