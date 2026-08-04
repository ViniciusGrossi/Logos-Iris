// PUT /api/admin/model-registry/:id — admin-only (ADR-030).
// Controller: valida Zod, resolve o usuário autenticado, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { getRequestScopedClient } from "@/lib/supabase/server-client";
import { getServiceRoleClient } from "@/lib/supabase/service-client";
import { SupabaseModelRegistryRepository } from "@/repositories/model-registry.repository";
import { updateModelRegistryEntrySchema } from "@/schemas/model-registry.schema";
import { ModelGatewayError, modelGatewayErrorStatus } from "@/services/model-gateway.errors";
import { ModelGatewayService } from "@/services/model-gateway.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Corpo da requisição inválido" } }, { status: 400 });
  }

  let parsed;
  try {
    parsed = updateModelRegistryEntrySchema.parse({ id, patch: body });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Payload inválido", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  const authClient = await getRequestScopedClient();
  const { data: authData, error: authError } = await authClient.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sessão inválida" } }, { status: 401 });
  }

  try {
    const service = new ModelGatewayService(new SupabaseModelRegistryRepository(getServiceRoleClient()));
    const updated = await service.updateModelRegistryEntry(authData.user.id, parsed);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ModelGatewayError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: modelGatewayErrorStatus(error) });
    }
    console.error("[PUT /api/admin/model-registry/:id] erro inesperado", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
