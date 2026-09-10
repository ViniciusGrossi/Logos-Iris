// Logos Iris — persona-atendimento (docs/specs/persona-atendimento.md)
// Validação Zod de todo input que cruza a fronteira do PersonaAtendimentoService.

import { z } from "zod";

import { personaSchema } from "@/schemas/conversation-engine.schema";

export const uuidSchema = z.string().uuid();

// Story 1/2/4 — monta o contexto (nucleo+persona compilados + memória) pronto para a chamada ao
// ModelGateway. Nenhum campo de horário aqui por design: Requisito 1 é a AUSÊNCIA estrutural de
// um gate de horário comercial, não uma checagem que passa.
export const buildEngineContextParamsSchema = z.object({
  tenant_id: uuidSchema,
  contact_id: uuidSchema,
  persona_ativa: personaSchema,
});
export type BuildEngineContextParams = z.infer<typeof buildEngineContextParamsSchema>;

// Story 3 — aciona PauseConversation com gatilho='baixa_confianca' quando a engine escala pra humano.
export const escalateToHumanParamsSchema = z.object({
  tenant_id: uuidSchema,
  conversation_id: uuidSchema,
});
export type EscalateToHumanParams = z.infer<typeof escalateToHumanParamsSchema>;
