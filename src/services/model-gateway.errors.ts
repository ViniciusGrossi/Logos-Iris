// Logos Iris — ModelGateway (model-gateway-v1)
// Erros tipados — Controller mapeia code -> status HTTP. Nunca throw genérico nem 500 cru.

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

/** Requisito 3 da spec: nenhum modelo ativo para (task_type, tier) — nunca retorna model_id nulo silenciosamente. */
export class NoActiveModelError extends ModelGatewayError {
  constructor(taskType: string, tier: string) {
    super(`Nenhum modelo ativo cadastrado para task_type="${taskType}" tier="${tier}"`, "NO_ACTIVE_MODEL");
  }
}

/** PUT /api/admin/model-registry/:id com id inexistente. */
export class ModelRegistryEntryNotFoundError extends ModelGatewayError {
  constructor(id: string) {
    super(`model_registry id="${id}" não encontrado`, "MODEL_REGISTRY_ENTRY_NOT_FOUND");
  }
}

/** ADR-030: /api/admin/model-registry* só admin (auth.uid()=ADMIN_USER_ID); tenant comum -> 403. */
export class ForbiddenAdminError extends ModelGatewayError {
  constructor() {
    super("Ação restrita ao admin", "FORBIDDEN_ADMIN");
  }
}

/** Falha de acesso a iris.model_registry (rede, permissão, etc) — nunca propaga o erro cru do driver. */
export class ModelRegistryQueryError extends ModelGatewayError {
  constructor(message: string) {
    super(`Falha ao acessar model_registry: ${message}`, "MODEL_REGISTRY_QUERY_FAILED");
  }
}

/** Único ponto de tradução code -> status HTTP, usado pelos Controllers admin/model-registry. */
export function modelGatewayErrorStatus(error: ModelGatewayError): number {
  switch (error.code) {
    case "FORBIDDEN_ADMIN":
      return 403;
    case "MODEL_REGISTRY_ENTRY_NOT_FOUND":
      return 404;
    case "NO_ACTIVE_MODEL":
      return 409;
    case "MODEL_REGISTRY_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
