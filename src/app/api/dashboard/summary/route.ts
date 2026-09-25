// GET /api/dashboard/summary?data= — "a Iris te conta o dia" (Requisitos 5/6).
// Controller: resolve tenant_id do JWT, valida Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseDashboardSummaryRepository } from "@/repositories/dashboard-summary.repository";
import { getDailySummaryQuerySchema } from "@/schemas/dashboard-summary.schema";
import { DashboardError, dashboardErrorStatus } from "@/services/dashboard.errors";
import { DashboardService } from "@/services/dashboard.service";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  const search = request.nextUrl.searchParams;

  let parsed;
  try {
    parsed = getDailySummaryQuerySchema.parse({
      tenant_id: resolved.tenantId,
      data: search.get("data") ?? undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Query inválida", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new DashboardService(new SupabaseDashboardSummaryRepository(createServiceClient()));
    const result = await service.getDailySummary(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DashboardError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: dashboardErrorStatus(error) });
    }
    console.error("[GET /api/dashboard/summary] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
