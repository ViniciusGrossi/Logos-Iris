// GET /api/appointments?from=&to=&status=&limit=&offset= — dono lista agendamentos (Requisito 4).
// POST /api/appointments — cria agendamento (Requisito 1, chamado pela tool "propor horário").
// Controller: resolve tenant_id do JWT, valida Zod, delega ao Service. Zero lógica de negócio aqui.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { resolveTenantFromRequest } from "@/lib/knowledge-base/resolve-tenant";
import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseAppointmentRepository } from "@/repositories/appointment.repository";
import { createAppointmentSchema, listAppointmentsQuerySchema } from "@/schemas/appointment.schema";
import { AppointmentError, appointmentErrorStatus } from "@/services/appointment.errors";
import { AppointmentService } from "@/services/appointment.service";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantFromRequest();
  if (!resolved.ok) {
    return NextResponse.json({ error: { code: resolved.code, message: resolved.message } }, { status: resolved.status });
  }

  const search = request.nextUrl.searchParams;

  let parsed;
  try {
    parsed = listAppointmentsQuerySchema.parse({
      tenant_id: resolved.tenantId,
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
      status: search.get("status") ?? undefined,
      limit: search.get("limit") ?? undefined,
      offset: search.get("offset") ?? undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Query inválida", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new AppointmentService(new SupabaseAppointmentRepository(createServiceClient()));
    const items = await service.listAppointments(parsed);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof AppointmentError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: appointmentErrorStatus(error) });
    }
    console.error("[GET /api/appointments] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    parsed = createAppointmentSchema.parse({ ...(body as Record<string, unknown>), tenant_id: resolved.tenantId });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Payload inválido", issues: error.issues } }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = new AppointmentService(new SupabaseAppointmentRepository(createServiceClient()));
    const created = await service.createAppointment(parsed);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof AppointmentError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: appointmentErrorStatus(error) });
    }
    console.error("[POST /api/appointments] erro inesperado");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } }, { status: 500 });
  }
}
