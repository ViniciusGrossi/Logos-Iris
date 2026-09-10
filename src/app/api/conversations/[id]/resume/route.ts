// POST /api/conversations/:id/resume — painel cliente, tenant-scoped (RLS + claim JWT). Requisito 7/8.
// Controller: resolve tenant_id do JWT, lê `confirmado_pelo_dono` do corpo, delega ao Service.
// A decisão de "pausa longa → aguardando_confirmacao" é do Service, não daqui.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createHumanHandoffService } from "@/services/human-handoff.factory";
import { HumanHandoffError, humanHandoffErrorStatus } from "@/services/human-handoff.errors";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: conversationId } = await params;

  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  let confirmado: unknown;
  try {
    const text = await req.text();
    confirmado = text.length > 0 ? (JSON.parse(text) as { confirmado_pelo_dono?: unknown }).confirmado_pelo_dono : undefined;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Corpo não é JSON válido" } }, { status: 400 });
  }

  try {
    const service = createHumanHandoffService();
    const result = await service.resumeConversation({
      tenant_id: resolved.tenantId,
      conversation_id: conversationId,
      confirmado_pelo_dono: confirmado === undefined ? false : (confirmado as boolean),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parâmetros inválidos", issues: error.issues } },
        { status: 400 },
      );
    }
    if (error instanceof HumanHandoffError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: humanHandoffErrorStatus(error) });
    }
    console.error("[POST /api/conversations/:id/resume] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
