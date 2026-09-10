// GET /api/admin/cost?tenant_id=&model_id=&from=&to=  — admin-only (ADR-030).
// Controller: resolve o usuário autenticado, repassa a query ao Service (que checa isAdmin e valida
// com Zod). Zero lógica de negócio / agregação aqui.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getRequestScopedClient } from "@/lib/supabase/server-client";
import { getServiceRoleClient } from "@/lib/supabase/service-client";
import { SupabaseModelUsageLogRepository } from "@/repositories/model-usage-log.repository";
import { CostObservabilityError, costObservabilityErrorStatus } from "@/services/cost-observability.errors";
import { CostObservabilityService } from "@/services/cost-observability.service";

export async function GET(req: Request): Promise<Response> {
  const authClient = await getRequestScopedClient();
  const { data: authData, error: authError } = await authClient.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sessão inválida" } }, { status: 401 });
  }

  const url = new URL(req.url);
  const params = {
    tenant_id: url.searchParams.get("tenant_id") ?? undefined,
    model_id: url.searchParams.get("model_id") ?? undefined,
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
  };

  try {
    const service = new CostObservabilityService(new SupabaseModelUsageLogRepository(getServiceRoleClient()));
    const result = await service.getCostBreakdown(authData.user.id, params);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos (from/to são ISO datetime obrigatórios)", issues: error.issues } },
        { status: 400 },
      );
    }
    if (error instanceof CostObservabilityError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: costObservabilityErrorStatus(error) });
    }
    console.error("[GET /api/admin/cost] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
