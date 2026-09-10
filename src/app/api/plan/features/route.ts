// GET /api/plan/features — painel cliente, tenant-scoped (RLS + claim JWT). Requisito 2/6.
// Controller: resolve tenant_id do JWT (nunca aceita tenant_id vindo do client), valida com Zod,
// delega ao Service. Zero lógica de negócio aqui — só leitura, nunca aplica gate.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabasePlanRepository, SupabaseUsageRepository } from "@/repositories/feature-gating.repository";
import { FeatureGatingError, featureGatingErrorStatus } from "@/services/feature-gating.errors";
import { FeatureGateService } from "@/services/feature-gating.service";
import { getCurrentPlanFeaturesQuerySchema } from "@/schemas/feature-gating.schema";

export async function GET() {
  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  let parsed;
  try {
    parsed = getCurrentPlanFeaturesQuerySchema.parse({ tenant_id: resolved.tenantId });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "tenant_id inválido", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const client = createServiceClient();
    const service = new FeatureGateService(new SupabasePlanRepository(client), new SupabaseUsageRepository(client));
    const result = await service.getCurrentPlanFeatures(parsed.tenant_id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FeatureGatingError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: featureGatingErrorStatus(error) });
    }
    console.error("[GET /api/plan/features] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
