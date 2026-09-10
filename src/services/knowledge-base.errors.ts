// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Erros tipados — Controller mapeia code -> status HTTP. Nunca throw genérico nem 500 cru.

export class KnowledgeBaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "KnowledgeBaseError";
  }
}

/** POST /api/knowledge-base/publish sem nenhum rascunho pendente — nada a publicar. */
export class NoDraftToPublishError extends KnowledgeBaseError {
  constructor() {
    super("Nenhum rascunho pendente para publicar", "NO_DRAFT_TO_PUBLISH");
  }
}

/** POST /api/knowledge-base/rollback/:versao com versão inexistente para o tenant. */
export class VersionNotFoundError extends KnowledgeBaseError {
  constructor(versao: number) {
    super(`Versão ${versao} não encontrada para este tenant`, "VERSION_NOT_FOUND");
  }
}

/** Falha de acesso a iris.knowledge_base_entries (rede, permissão, etc) — nunca propaga o erro cru do driver. */
export class KnowledgeEntryQueryError extends KnowledgeBaseError {
  constructor(message: string) {
    super(`Falha ao acessar knowledge_base_entries: ${message}`, "KNOWLEDGE_ENTRY_QUERY_FAILED");
  }
}

/** Único ponto de tradução code -> status HTTP, usado pelos Controllers de /api/knowledge-base*. */
export function knowledgeBaseErrorStatus(error: KnowledgeBaseError): number {
  switch (error.code) {
    case "NO_DRAFT_TO_PUBLISH":
      return 409;
    case "VERSION_NOT_FOUND":
      return 404;
    case "KNOWLEDGE_ENTRY_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
