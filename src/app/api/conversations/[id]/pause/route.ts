// POST /api/conversations/:id/pause — painel cliente, tenant-scoped (RLS + claim JWT). Requisito 1.
// Controller: resolve tenant_id do JWT (nunca aceita tenant_id vindo do client), injeta
// gatilho='botao_painel', delega ao Service. Zero lógica de negócio aqui.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createHumanHandoffService } from "@/services/human-handoff.factory";
import { HumanHandoffError, humanHandoffErrorStatus } from "@/services/human-handoff.errors";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: conversationId } = await params;

  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  // Corpo opcional: { pausada_ate?: string }. Ausência de corpo é válida (pausa sem prazo explícito).
  let pausadaAte: unknown;
  try {
    const text = await _req.text();
    pausadaAte = text.length > 0 ? (JSON.parse(text) as { pausada_ate?: unknown }).pausada_ate : undefined;
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Corpo não é JSON válido" } }, { status: 400 });
  }

  try {
    const service = createHumanHandoffService();
    const result = await service.pauseConversation({
      tenant_id: resolved.tenantId,
      conversation_id: conversationId,
      gatilho: "botao_painel",
      pausada_ate: pausadaAte as string | undefined,
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
    console.error("[POST /api/conversations/:id/pause] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
