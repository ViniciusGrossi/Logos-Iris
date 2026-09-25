// Logos Iris — persona-agendamento (docs/specs/persona-agendamento.md)
// Copiado 1:1 de specs/api.contracts.ts (AppointmentDTO/AppointmentStatus).

export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "remarcado"
  | "no_show"
  | "cancelado"
  | "concluido";

export interface AppointmentDTO {
  id: string;
  contact_id: string;
  conversation_id: string;
  horario: string;
  status: AppointmentStatus;
  confirmacao_enviada_em: string | null;
}
