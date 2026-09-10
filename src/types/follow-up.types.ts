// Logos Iris — Follow-ups (referência de uso do gate — feature-gating-v1, Requisito 3)
// A spec própria de Follow-up (wave 2, persona-vendas.md) ainda não existe; este DTO cobre só o
// necessário para ScheduleFollowUp servir de caso de referência de FeatureGateService.checkFeatureGate.
// Copiado 1:1 de specs/api.contracts.ts (interface FollowUpDTO).

export interface FollowUpDTO {
  id: string;
  conversation_id: string;
  agendado_para: string;
  status: "pendente" | "enviado" | "cancelado";
}
