// Logos Iris — Feature Gating (feature-gating-v1)
// Tipos de saída (DTOs/resultados). Copiado 1:1 de specs/api.contracts.ts (seção "Feature Gating").
// Enums/keys derivam de src/schemas/feature-gating.schema.ts (fonte única de PLAN_FEATURE_KEYS).

import type { PLAN_FEATURE_KEYS } from "@/schemas/feature-gating.schema";

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

/** Linha de iris.plans mapeada 1:1 com PlanFeatures do contrato — nunca a row bruta do banco. */
export interface PlanFeatures {
  max_personas_ativas: number;
  roteador_invisivel_incluso: boolean;
  tier_modelo: "basico" | "premium";
  limite_mensagens_mes: number;
  retencao_memoria_dias: number;
  follow_ups_automaticos_mes: number;
  auditoria_qualidade_incluida: boolean;
  seats_painel: number;
  api_oficial_meta_addon_disponivel: boolean;
  voz_clonada_addon_disponivel: boolean;
}

/** Uso atual do tenant, calculado em request-time (sem snapshot pré-computado nesta v1). */
export interface UsageSnapshot {
  mensagens_mes_atual: number;
  personas_ativas_count: number;
  numeros_conectados: number;
}

/** Retorno de PlanRepository.findPlanFeaturesByTenantId — plano resolvido via tenants.plano_id. */
export interface PlanFeaturesForTenant {
  planoNome: string;
  features: PlanFeatures;
}

/** GET /api/plan/features — painel cliente, só leitura, nunca aplica gate. */
export interface GetCurrentPlanFeaturesResult {
  plano_nome: string;
  features: PlanFeatures;
  uso_atual: UsageSnapshot;
}

/** Retorno de FeatureGateService.checkFeatureGate — nunca lança erro genérico quando bloqueado. */
export interface CheckFeatureGateResult {
  permitido: boolean;
  motivo?: string;
}
