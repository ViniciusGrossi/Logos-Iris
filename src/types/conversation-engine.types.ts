// Logos Iris — ConversationEngine (conversation-engine-v1)
// Tipos de saída (DTOs/resultados). Persona deriva de src/schemas/conversation-engine.schema.ts
// (fonte única — evita drift entre validação de input e tipo).

import type { PERSONAS } from "@/schemas/conversation-engine.schema";

export type Persona = (typeof PERSONAS)[number];

/**
 * Artefato de build — camadas 1 (núcleo imutável) + 2 (persona), ADR-027.
 * Nunca um campo editável por usuário/admin fora do pipeline de compilação (Requisito 5, Story 18).
 * v1 implementa só as camadas 1-2; a assinatura evolui em wave futura para as camadas 3-4
 * (artisanal_layer_versions + knowledge_base_entries).
 */
export interface CompiledPromptV1 {
  nucleo: string; // camada 1 — imutável, código versionado
  persona: string; // camada 2 — template por Persona, código
  persona_ativa: Persona;
}
