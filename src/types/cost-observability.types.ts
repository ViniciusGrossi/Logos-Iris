// Logos Iris — cost-observability-v1 (docs/specs/cost-observability-v1.md)
// DTOs. GetCostBreakdown copiado EXATAMENTE de specs/api.contracts.ts; ModelUsageLogDTO derivado
// de specs/product.schema.json (entidade model_usage_log).

import type { ModelProvider } from "@/types/model-gateway.types";

/** Entrada da escrita interna (chamada pelo ModelGateway a cada resposta de modelo). */
export interface LogModelUsageInput {
  tenant_id: string;
  conversation_id: string;
  model_id: string;
  /** id da mensagem 'enviada' correspondente — os campos de custo são espelhados nela (Requisito 3). */
  message_id: string;
  tokens_input: number;
  tokens_output: number;
  latencia_ms: number;
  /** true quando a chamada resultou em pausa por baixa_confianca (Requisito 5, consumido de human-handoff). */
  escalonou_para_humano: boolean;
}

export interface CostBreakdownFilters {
  tenant_id?: string;
  model_id?: string;
  from: string;
  to: string;
}

export interface CostBreakdownPorModelo {
  model_id: string;
  provider: ModelProvider;
  custo_usd: number;
  taxa_escalonamento: number;
}

/** Retorno de GetCostBreakdown — shape idêntico ao de specs/api.contracts.ts. */
export interface CostBreakdown {
  total_custo_usd: number;
  total_tokens_input: number;
  total_tokens_output: number;
  latencia_media_ms: number;
  taxa_escalonamento: number;
  quebra_por_modelo: CostBreakdownPorModelo[];
}

/** Linha crua de model_usage_log necessária para agregar (só as colunas usadas). */
export interface UsageLogAggregateRow {
  model_id: string;
  tokens_input: number;
  tokens_output: number;
  custo_usd: number;
  latencia_ms: number;
  escalonou_para_humano: boolean;
}
