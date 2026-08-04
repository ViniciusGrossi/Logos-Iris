// Logos Iris — ModelGateway (model-gateway-v1)
// Tipos de saída (DTOs/resultados). Enums derivam de src/schemas/model-registry.schema.ts
// (fonte única — evita drift entre validação de input e tipo).

import type { MODEL_PROVIDERS, MODEL_TASK_TYPES, PLAN_TIERS } from "@/schemas/model-registry.schema";

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
export type ModelTaskType = (typeof MODEL_TASK_TYPES)[number];
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Retorno de RouteModel — modelo escolhido para a chamada. */
export interface ModelRouteResult {
  model_id: string;
  provider: ModelProvider;
  model_name: string;
  fallback_chain_position: number;
}

/** Linha de iris.model_registry — retornada pelo Repository, nunca a row bruta do banco. */
export interface ModelRegistryEntryDTO {
  id: string;
  provider: ModelProvider;
  model_name: string;
  task_type: ModelTaskType;
  tier: PlanTier;
  prioridade_fallback: number;
  ativo: boolean;
  custo_por_1k_tokens_input: number;
  custo_por_1k_tokens_output: number;
}
