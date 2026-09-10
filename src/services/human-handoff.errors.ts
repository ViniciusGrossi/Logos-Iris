// Logos Iris — human-handoff (docs/specs/human-handoff.md)
// Erros tipados — Controller mapeia code -> status HTTP. Nunca throw genérico nem 500 cru
// (CLAUDE.md, _shared.md §4). Mesmo formato de src/services/feature-gating.errors.ts.

export class HumanHandoffError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "HumanHandoffError";
  }
}

/**
 * Conversa não existe para o tenant do claim — inclui o caso de isolamento multi-tenant
 * (tenant A tentando pausar/retomar conversation_id do tenant B): o Repository filtra por
 * tenant_id, então a linha do outro tenant simplesmente não é encontrada (Requisito 6, _shared §3).
 */
export class ConversationNotFoundError extends HumanHandoffError {
  constructor(conversationId: string) {
    super(`Conversa "${conversationId}" não encontrada para este tenant`, "CONVERSATION_NOT_FOUND");
  }
}

/** Conversa encerrada não pausa nem retoma — estado terminal (CHECK de iris.conversations). */
export class ConversationEncerradaError extends HumanHandoffError {
  constructor(conversationId: string) {
    super(`Conversa "${conversationId}" está encerrada — não pode ser pausada nem retomada`, "CONVERSATION_ENCERRADA");
  }
}

/** Falha de acesso ao banco (rede, permissão, constraint) — nunca propaga o erro cru do driver. */
export class HandoffPersistenceError extends HumanHandoffError {
  constructor(message: string) {
    super(`Falha ao persistir handoff: ${message}`, "HANDOFF_PERSISTENCE_FAILED");
  }
}

/** Único ponto de tradução code -> status HTTP, usado pelos Controllers de /api/conversations/:id/(pause|resume). */
export function humanHandoffErrorStatus(error: HumanHandoffError): number {
  switch (error.code) {
    case "CONVERSATION_NOT_FOUND":
      return 404;
    case "CONVERSATION_ENCERRADA":
      return 409;
    case "HANDOFF_PERSISTENCE_FAILED":
      return 502;
    default:
      return 400;
  }
}
