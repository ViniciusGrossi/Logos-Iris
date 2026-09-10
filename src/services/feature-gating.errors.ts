// Logos Iris — Feature Gating (feature-gating-v1)
// Erros tipados — Controller mapeia code -> status HTTP. Nunca throw genérico nem 500 cru.

export class FeatureGatingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FeatureGatingError";
  }
}

/**
 * tenants.plano_id é NOT NULL + FK para iris.plans (migração 0002) — nunca deveria faltar em uso
 * normal. Mantido como defesa em profundidade: se o join falhar (tenant inexistente/soft-deletado,
 * plano removido), nunca cai num objeto parcial nem PlanFeatures undefined silencioso.
 */
export class TenantPlanNotFoundError extends FeatureGatingError {
  constructor(tenantId: string) {
    super(`Plano não encontrado para tenant_id="${tenantId}"`, "TENANT_PLAN_NOT_FOUND");
  }
}

/**
 * Requisito 1 da spec (docs/specs/feature-gating-v1.md, "Fora de Escopo"): esta v1 só estabelece o
 * padrão CheckFeatureGate com follow_ups_automaticos_mes como caso de referência já contratado. As
 * demais chaves de PlanFeatures entram quando a ação correspondente tiver spec/endpoint próprio —
 * chamar checkFeatureGate com uma delas falha alto e claro, nunca permite a ação silenciosamente.
 */
export class FeatureGateNotImplementedError extends FeatureGatingError {
  constructor(feature: string) {
    super(
      `CheckFeatureGate("${feature}") ainda não tem enforcement nesta v1 — só "follow_ups_automaticos_mes" é caso de referência (ver Fora de Escopo da spec)`,
      "FEATURE_GATE_NOT_IMPLEMENTED",
    );
  }
}

/** Falha de acesso a iris.plans/iris.tenants (rede, permissão, etc) — nunca propaga o erro cru do driver. */
export class PlanQueryError extends FeatureGatingError {
  constructor(message: string) {
    super(`Falha ao acessar plano do tenant: ${message}`, "PLAN_QUERY_FAILED");
  }
}

/** Falha de acesso às fontes de uso (messages/tenants/whatsapp_connections/follow_ups). */
export class UsageQueryError extends FeatureGatingError {
  constructor(message: string) {
    super(`Falha ao calcular uso atual do tenant: ${message}`, "USAGE_QUERY_FAILED");
  }
}

/** POST /api/follow-ups (referência) — falha ao persistir o follow_up já aprovado pelo gate. */
export class FollowUpQueryError extends FeatureGatingError {
  constructor(message: string) {
    super(`Falha ao criar follow_up: ${message}`, "FOLLOW_UP_QUERY_FAILED");
  }
}

/** Único ponto de tradução code -> status HTTP, usado pelo Controller GET /api/plan/features. */
export function featureGatingErrorStatus(error: FeatureGatingError): number {
  switch (error.code) {
    case "TENANT_PLAN_NOT_FOUND":
      return 404;
    case "FEATURE_GATE_NOT_IMPLEMENTED":
      return 501;
    case "PLAN_QUERY_FAILED":
    case "USAGE_QUERY_FAILED":
    case "FOLLOW_UP_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
