// Logos Iris — ConversationEngine (conversation-engine-v1)
// Validação Zod de todo input que cruza a fronteira do Service.
// Fonte canônica: docs/specs/conversation-engine-v1.md (API Contract) + ADR-027 (ARCHITECTURE.md).

import { z } from "zod";

/** Mesmo enum de specs/api.contracts.ts (Persona) — repetido aqui pois o contract não exporta runtime values. */
export const PERSONAS = ["atendimento", "vendas", "agendamento", "sdr"] as const;

export const personaSchema = z.enum(PERSONAS);

// ── compilePrompt (chamado internamente pela ConversationEngineService, sem HTTP — spec, Restrições Técnicas) ──

export const compilePromptParamsSchema = z.object({
  persona_ativa: personaSchema,
});
export type CompilePromptParams = z.infer<typeof compilePromptParamsSchema>;
