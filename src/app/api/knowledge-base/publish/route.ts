// POST /api/knowledge-base/publish — lint de instrução disfarçada roda aqui e bloqueia se detectar
// (Requisito 4). Controller: resolve tenant_id do JWT, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse } from "next/server";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseKnowledgeEntryRepository } from "@/repositories/knowledge-base.repository";
import { KnowledgeBaseError, knowledgeBaseErrorStatus } from "@/services/knowledge-base.errors";
import { KnowledgeBaseService } from "@/services/knowledge-base.service";

export async function POST() {
  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  try {
    const service = new KnowledgeBaseService(new SupabaseKnowledgeEntryRepository(createServiceClient()));
    const result = await service.publishKnowledgeBase({ tenant_id: resolved.tenantId });
    // "bloqueado" é um resultado de negócio válido (não um erro HTTP) — 200 nos dois casos.
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: knowledgeBaseErrorStatus(error) });
    }
    console.error("[POST /api/knowledge-base/publish] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
