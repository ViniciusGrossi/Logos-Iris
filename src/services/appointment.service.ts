// Logos Iris — persona-agendamento (docs/specs/persona-agendamento.md)
// AppointmentService: CreateAppointment/ListAppointments/UpdateAppointmentStatus (Requisitos
// 1, 3, 4, 6, 7). A confirmação de véspera (Requisito 2/5) é um job separado — ver
// supabase/migrations/0025_appointments_confirmation_timezone.sql +
// supabase/functions/appointment-confirmation-worker/ — este Service cobre só o CRUD tenant-scoped.

import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentStatusSchema,
  type CreateAppointmentParams,
  type ListAppointmentsQuery,
  type UpdateAppointmentStatusParams,
} from "@/schemas/appointment.schema";
import type { AppointmentRepository } from "@/repositories/appointment.repository";
import { PastHorarioError, CrossTenantReferenceError, AppointmentNotFoundError } from "@/services/appointment.errors";
import type { AppointmentDTO } from "@/types/appointment.types";

export class AppointmentService {
  constructor(private readonly repo: AppointmentRepository) {}

  /**
   * CreateAppointment (API Contract) — Requisito 1 (grava status='agendado' via default da coluna),
   * 6 (rejeita horario no passado ANTES de qualquer I/O) e 7 (contact/conversation do MESMO tenant).
   */
  async createAppointment(input: CreateAppointmentParams): Promise<AppointmentDTO> {
    const params = createAppointmentSchema.parse(input);

    if (new Date(params.horario).getTime() < Date.now()) {
      throw new PastHorarioError();
    }

    const [contactOk, conversationOk] = await Promise.all([
      this.repo.contactBelongsToTenant(params.tenant_id, params.contact_id),
      this.repo.conversationBelongsToTenant(params.tenant_id, params.conversation_id),
    ]);
    if (!contactOk || !conversationOk) throw new CrossTenantReferenceError();

    return this.repo.create({
      tenantId: params.tenant_id,
      contactId: params.contact_id,
      conversationId: params.conversation_id,
      horario: params.horario,
    });
  }

  /** ListAppointments (API Contract) — Requisito 4, paginado (gate_saida fase 7). */
  async listAppointments(input: ListAppointmentsQuery): Promise<AppointmentDTO[]> {
    const params = listAppointmentsQuerySchema.parse(input);
    return this.repo.listByTenant({
      tenantId: params.tenant_id,
      from: params.from,
      to: params.to,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /** UpdateAppointmentStatus (API Contract) — Requisito 3 (remarcação em 1 toque sobrescreve horario). */
  async updateAppointmentStatus(input: UpdateAppointmentStatusParams): Promise<AppointmentDTO> {
    const params = updateAppointmentStatusSchema.parse(input);

    // Achado do /code-review: mesma regra de CreateAppointment (Requisito 6) — remarcar pra um
    // horário no passado é o mesmo tipo de dado inválido que criar direto no passado.
    if (params.status === "remarcado" && params.novo_horario && new Date(params.novo_horario).getTime() < Date.now()) {
      throw new PastHorarioError();
    }

    const updated = await this.repo.updateStatus({
      tenantId: params.tenant_id,
      appointmentId: params.appointment_id,
      status: params.status,
      novoHorario: params.novo_horario,
    });
    if (!updated) throw new AppointmentNotFoundError(params.appointment_id);
    return updated;
  }
}
