// Logos Iris — persona-agendamento (docs/specs/persona-agendamento.md)
// Erros tipados — Controller mapeia code -> status HTTP. Nunca throw genérico nem 500 cru.

export class AppointmentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppointmentError";
  }
}

/** Requisito 6 — CreateAppointment rejeita horario no passado antes de chamar o Repository. */
export class PastHorarioError extends AppointmentError {
  constructor() {
    super("horario não pode estar no passado", "PAST_HORARIO");
  }
}

/**
 * Requisito 7 — contact_id e conversation_id precisam pertencer ao MESMO tenant_id do chamador.
 * FK garante que cada um existe isoladamente, nunca que os dois são do mesmo tenant entre si —
 * checagem cruzada explícita no Service, defesa em profundidade além de RLS.
 */
export class CrossTenantReferenceError extends AppointmentError {
  constructor() {
    super(
      "contact_id e/ou conversation_id não pertencem ao tenant_id informado",
      "CROSS_TENANT_REFERENCE",
    );
  }
}

/** PATCH /api/appointments/:id/status para id inexistente OU de outro tenant (mesmo efeito — RLS). */
export class AppointmentNotFoundError extends AppointmentError {
  constructor(appointmentId: string) {
    super(`appointment ${appointmentId} não encontrado para este tenant`, "APPOINTMENT_NOT_FOUND");
  }
}

/** Falha de acesso a iris.appointments (rede, permissão, etc) — nunca propaga o erro cru do driver. */
export class AppointmentQueryError extends AppointmentError {
  constructor(message: string) {
    super(`Falha ao acessar appointments: ${message}`, "APPOINTMENT_QUERY_FAILED");
  }
}

/** Único ponto de tradução code -> status HTTP, usado pelos Controllers de /api/appointments*. */
export function appointmentErrorStatus(error: AppointmentError): number {
  switch (error.code) {
    case "PAST_HORARIO":
      return 400;
    case "CROSS_TENANT_REFERENCE":
      return 403;
    case "APPOINTMENT_NOT_FOUND":
      return 404;
    case "APPOINTMENT_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
