// Logos Iris — cost-observability-v1. Erros tipados — nunca throw genérico nem 500 cru (CLAUDE.md).

export class CostObservabilityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CostObservabilityError";
  }
}

/** GET /api/admin/cost chamado por quem não é o admin hardcoded (ADR-030). */
export class ForbiddenAdminError extends CostObservabilityError {
  constructor() {
    super("Acesso restrito ao admin da Logos", "FORBIDDEN_ADMIN");
  }
}

/** model_id sem correspondência em model_registry no momento da chamada (Requisito 2). */
export class ModelRatesNotFoundError extends CostObservabilityError {
  constructor(modelId: string) {
    super(`Tarifas não encontradas para model_id="${modelId}" em model_registry`, "MODEL_RATES_NOT_FOUND");
  }
}

/** Falha de acesso ao banco (rede, permissão, partição) — nunca propaga o erro cru do driver. */
export class CostQueryError extends CostObservabilityError {
  constructor(message: string) {
    super(`Falha ao acessar dados de custo: ${message}`, "COST_QUERY_FAILED");
  }
}

export function costObservabilityErrorStatus(error: CostObservabilityError): number {
  switch (error.code) {
    case "FORBIDDEN_ADMIN":
      return 403;
    case "MODEL_RATES_NOT_FOUND":
      return 404;
    case "COST_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
