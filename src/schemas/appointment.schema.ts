// Logos Iris — persona-agendamento (docs/specs/persona-agendamento.md)
// Validação Zod de todo input que cruza a fronteira do AppointmentService — antes do Service,
// nunca depois (CLAUDE.md, _shared.md §4).

import { z } from "zod";

export const APPOINTMENT_STATUSES = [
  "agendado",
  "confirmado",
  "remarcado",
  "no_show",
  "cancelado",
  "concluido",
] as const;

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(new Date(v).getTime()), {
  message: "precisa ser uma data ISO válida",
});

// ── POST /api/appointments (chamado pela tool "propor horário" da ConversationEngine) ──
export const createAppointmentSchema = z.object({
  tenant_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  horario: isoDateTime,
});
export type CreateAppointmentParams = z.infer<typeof createAppointmentSchema>;

// ── GET /api/appointments?from=&to=&status=&limit=&offset= ──
// Paginação (gate_saida fase 7: "Paginação em toda listagem") — limit/offset simples, default 20,
// teto 100 (evita listagem sem limite nenhum mesmo se o client não passar o param).
export const listAppointmentsQuerySchema = z.object({
  tenant_id: z.string().uuid(),
  from: isoDateTime,
  to: isoDateTime,
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
// z.input (não z.infer/output): limit/offset têm .default() — o TYPE de entrada precisa deixá-los
// opcionais pro caller poder omitir (o Service aplica o default de verdade via .parse() em runtime).
export type ListAppointmentsQuery = z.input<typeof listAppointmentsQuerySchema>;

// ── PATCH /api/appointments/:id/status (confirmação véspera, remarcação em 1 toque, no-show) ──
export const updateAppointmentStatusSchema = z
  .object({
    tenant_id: z.string().uuid(),
    appointment_id: z.string().uuid(),
    status: z.enum(APPOINTMENT_STATUSES),
    novo_horario: isoDateTime.optional(),
  })
  .refine((v) => v.status !== "remarcado" || typeof v.novo_horario === "string", {
    message: "novo_horario é obrigatório quando status='remarcado'",
    path: ["novo_horario"],
  })
  // Achado do /code-review: sem este refine, um PATCH com status='no_show'/'cancelado'/etc. e um
  // novo_horario "de brinde" no corpo movia o horario como efeito colateral (o Repository aplicava
  // novo_horario sempre que truthy, ignorando o status). novo_horario só faz sentido pra remarcação.
  .refine((v) => v.status === "remarcado" || v.novo_horario === undefined, {
    message: "novo_horario só é aceito quando status='remarcado'",
    path: ["novo_horario"],
  });
export type UpdateAppointmentStatusParams = z.infer<typeof updateAppointmentStatusSchema>;
