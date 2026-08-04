// Logos Iris — ConversationEngine (conversation-engine-v1)
// Erros tipados — nunca throw genérico nem 500 cru.

export class ConversationEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ConversationEngineError";
  }
}

/**
 * Requisito 5 da spec: persona_ativa vinda de fonte não tipada (ex.: valor corrompido no banco,
 * fora do enum Persona) — nunca compila um prompt parcial/indefinido, lança erro explícito.
 */
export class InvalidPersonaError extends ConversationEngineError {
  constructor(received: unknown) {
    super(`persona_ativa inválida: ${JSON.stringify(received)}`, "INVALID_PERSONA");
  }
}
