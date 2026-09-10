import type { CompiledPromptV1 } from "@/types/conversation-engine.types";

/**
 * Contexto pronto para a chamada ao ModelGateway (Story 2, ADR-027) — compiledPrompt (camadas 1-2,
 * conversation-engine-v1) + memória de contato injetada como contexto adicional. memoriaContexto é
 * null quando não há contact_memory_summaries válido (cliente novo OU só resumos expirados —
 * ambos os casos são tratados como "sem memória", nunca quebram o fluxo, Story 2).
 */
export interface EngineCallContext {
  compiledPrompt: CompiledPromptV1;
  memoriaContexto: string | null;
}
