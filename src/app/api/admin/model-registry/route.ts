// GET /api/admin/model-registry — admin-only (ADR-030).
// Controller: só resolve o usuário autenticado e delega ao Service. Zero lógica de negócio aqui.

import { NextResponse } from "next/server";

import { getRequestScopedClient } from "@/lib/supabase/server-client";
import { getServiceRoleClient } from "@/lib/supabase/service-client";
import { SupabaseModelRegistryRepository } from "@/repositories/model-registry.repository";
import { ModelGatewayError, modelGatewayErrorStatus } from "@/services/model-gateway.errors";
import { ModelGatewayService } from "@/services/model-gateway.service";

export async function GET() {
  const authClient = await getRequestScopedClient();
  const { data: authData, error: authError } = await authClient.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sessão inválida" } }, { status: 401 });
  }

  try {
    const service = new ModelGatewayService(new SupabaseModelRegistryRepository(getServiceRoleClient()));
    const items = await service.listModelRegistry(authData.user.id);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof ModelGatewayError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: modelGatewayErrorStatus(error) });
    }
    console.error("[GET /api/admin/model-registry] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
