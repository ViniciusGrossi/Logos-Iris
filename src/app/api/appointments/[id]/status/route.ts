// PATCH /api/appointments/:id/status — confirmação de véspera, remarcação em 1 toque, no-show
// (Requisito 3). Controller: resolve tenant_id do JWT, valida Zod, delega ao Service.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseAppointmentRepository } from "@/repositories/appointment.repository";
import { updateAppointmentStatusSchema } from "@/schemas/appointment.schema";
import { AppointmentError, appointmentErrorStatus } from "@/services/appointment.errors";
import { AppointmentService } from "@/services/appointment.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

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

  let parsed;
  try {
    parsed = updateAppointmentStatusSchema.parse({
      ...(body as Record<string, unknown>),
      tenant_id: resolved.tenantId,
      appointment_id: id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Payload inválido", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new AppointmentService(new SupabaseAppointmentRepository(createServiceClient()));
    const updated = await service.updateAppointmentStatus(parsed);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AppointmentError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: appointmentErrorStatus(error) });
    }
    console.error("[PATCH /api/appointments/:id/status] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
