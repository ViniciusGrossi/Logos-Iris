import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { AppointmentQueryError } from "@/services/appointment.errors";
import type { AppointmentDTO, AppointmentStatus } from "@/types/appointment.types";

interface AppointmentRow {
  id: string;
  contact_id: string;
  conversation_id: string;
  horario: string;
  status: string;
  confirmacao_enviada_em: string | null;
}

const APPOINTMENT_COLUMNS = "id, contact_id, conversation_id, horario, status, confirmacao_enviada_em";

function toDTO(row: AppointmentRow): AppointmentDTO {
  return {
    id: row.id,
    contact_id: row.contact_id,
    conversation_id: row.conversation_id,
    horario: row.horario,
    status: row.status as AppointmentStatus,
    confirmacao_enviada_em: row.confirmacao_enviada_em,
  };
}

export interface AppointmentRepository {
  /** Requisito 7 — checagem cruzada: contact_id existe E pertence a este tenant_id (nunca soft-deletado). */
  contactBelongsToTenant(tenantId: string, contactId: string): Promise<boolean>;
  /** Requisito 7 — checagem cruzada: conversation_id existe E pertence a este tenant_id. */
  conversationBelongsToTenant(tenantId: string, conversationId: string): Promise<boolean>;
  create(params: {
    tenantId: string;
    contactId: string;
    conversationId: string;
    horario: string;
  }): Promise<AppointmentDTO>;
  listByTenant(params: {
    tenantId: string;
    from: string;
    to: string;
    status?: AppointmentStatus;
    limit: number;
    offset: number;
  }): Promise<AppointmentDTO[]>;
  /** null = nenhuma linha afetada (id inexistente OU de outro tenant) — Service traduz p/ 404. */
  updateStatus(params: {
    tenantId: string;
    appointmentId: string;
    status: AppointmentStatus;
    novoHorario?: string;
  }): Promise<AppointmentDTO | null>;
}

export class SupabaseAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async contactBelongsToTenant(tenantId: string, contactId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new AppointmentQueryError(error.message);
    return data !== null;
  }

  async conversationBelongsToTenant(tenantId: string, conversationId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw new AppointmentQueryError(error.message);
    return data !== null;
  }

  async create(params: {
    tenantId: string;
    contactId: string;
    conversationId: string;
    horario: string;
  }): Promise<AppointmentDTO> {
    const { data, error } = await this.db
      .from("appointments")
      .insert({
        tenant_id: params.tenantId,
        contact_id: params.contactId,
        conversation_id: params.conversationId,
        horario: params.horario,
      })
      .select(APPOINTMENT_COLUMNS)
      .maybeSingle();

    if (error) throw new AppointmentQueryError(error.message);
    if (!data) throw new AppointmentQueryError("create: insert não retornou linha");
    return toDTO(data as AppointmentRow);
  }

  async listByTenant(params: {
    tenantId: string;
    from: string;
    to: string;
    status?: AppointmentStatus;
    limit: number;
    offset: number;
  }): Promise<AppointmentDTO[]> {
    let query = this.db
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("tenant_id", params.tenantId)
      .gte("horario", params.from)
      .lte("horario", params.to);

    if (params.status) query = query.eq("status", params.status);

    const { data, error } = await query
      .order("horario", { ascending: true })
      .range(params.offset, params.offset + params.limit - 1);

    if (error) throw new AppointmentQueryError(error.message);
    return ((data ?? []) as AppointmentRow[]).map(toDTO);
  }

  async updateStatus(params: {
    tenantId: string;
    appointmentId: string;
    status: AppointmentStatus;
    novoHorario?: string;
  }): Promise<AppointmentDTO | null> {
    // Remarcação em 1 toque (Requisito 3) sobrescreve o `horario` — o contrato não tem coluna
    // separada pro novo horário, só o AppointmentDTO.horario atualizado. Defesa em profundidade
    // (achado do /code-review): só aplica novoHorario quando status==='remarcado', mesmo que o
    // Zod (updateAppointmentStatusSchema) já rejeite novo_horario pra qualquer outro status —
    // nunca confia só na camada de validação de entrada pra uma mutação de dado.
    const patch: { status: AppointmentStatus; horario?: string } = { status: params.status };
    if (params.status === "remarcado" && params.novoHorario) patch.horario = params.novoHorario;

    const { data, error } = await this.db
      .from("appointments")
      .update(patch)
      .eq("id", params.appointmentId)
      .eq("tenant_id", params.tenantId) // nunca confia em id isolado — sempre tenant-scoped
      .select(APPOINTMENT_COLUMNS)
      .maybeSingle();

    if (error) throw new AppointmentQueryError(error.message);
    return data ? toDTO(data as AppointmentRow) : null;
  }
}
