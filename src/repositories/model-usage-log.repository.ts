// Logos Iris — cost-observability-v1
// Único ponto de acesso a iris.model_usage_log (+ leitura de tarifas em iris.model_registry e
// espelho em iris.messages). Client injetado é service-role: model_usage_log é RLS-select-só-para-
// tenant e a escrita é interna do ModelGateway (0012); admin lê tudo bypassa RLS (ADR-030).
// Mesmo padrão de client de model-registry.repository.ts (.schema("iris") encadeado).

import type { SupabaseClient } from "@supabase/supabase-js";

import { CostQueryError } from "@/services/cost-observability.errors";
import type { ModelProvider } from "@/types/model-gateway.types";
import type { UsageLogAggregateRow } from "@/types/cost-observability.types";

const SCHEMA = "iris";

/**
 * Teto de linhas puxadas para a agregação em memória (Requisito 4 / Restrições: "query agregada,
 * evitar N+1"). v1: BRIN em created_at + filtro de período mantém o range scan barato no volume do
 * piloto. Upgrade path quando o volume crescer: mover o group by para um RPC SECURITY DEFINER
 * (mesma técnica de iris.gateway_* na 0015) — registrado como Sync Request.
 */
export const MAX_AGGREGATION_ROWS = 50_000;

export interface ModelRates {
  custo_por_1k_tokens_input: number;
  custo_por_1k_tokens_output: number;
}

export interface ModelUsageLogRepository {
  getModelRates(modelId: string): Promise<ModelRates | null>;
  insertUsage(row: {
    tenant_id: string;
    conversation_id: string;
    model_id: string;
    tokens_input: number;
    tokens_output: number;
    custo_usd: number;
    latencia_ms: number;
    escalonou_para_humano: boolean;
  }): Promise<void>;
  mirrorToMessage(params: {
    message_id: string;
    tenant_id: string;
    model_id: string;
    tokens_input: number;
    tokens_output: number;
    custo_usd: number;
    latencia_ms: number;
  }): Promise<void>;
  fetchUsageRows(filters: {
    tenant_id?: string;
    model_id?: string;
    from: string;
    to: string;
  }): Promise<UsageLogAggregateRow[]>;
  fetchProviders(modelIds: string[]): Promise<Map<string, ModelProvider>>;
}

export class SupabaseModelUsageLogRepository implements ModelUsageLogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getModelRates(modelId: string): Promise<ModelRates | null> {
    const { data, error } = await this.client
      .schema(SCHEMA)
      .from("model_registry")
      .select("custo_por_1k_tokens_input, custo_por_1k_tokens_output")
      .eq("id", modelId)
      .maybeSingle();

    if (error) throw new CostQueryError(error.message);
    if (!data) return null;

    const row = data as { custo_por_1k_tokens_input: number | string; custo_por_1k_tokens_output: number | string };
    return {
      // numeric(10,6) pode voltar como string no driver — normaliza (mesmo cuidado de model-registry.repository.ts).
      custo_por_1k_tokens_input: Number(row.custo_por_1k_tokens_input),
      custo_por_1k_tokens_output: Number(row.custo_por_1k_tokens_output),
    };
  }

  async insertUsage(row: {
    tenant_id: string;
    conversation_id: string;
    model_id: string;
    tokens_input: number;
    tokens_output: number;
    custo_usd: number;
    latencia_ms: number;
    escalonou_para_humano: boolean;
  }): Promise<void> {
    const { error } = await this.client.schema(SCHEMA).from("model_usage_log").insert(row);
    if (error) throw new CostQueryError(`model_usage_log insert falhou: ${error.message}`);
  }

  async mirrorToMessage(params: {
    message_id: string;
    tenant_id: string;
    model_id: string;
    tokens_input: number;
    tokens_output: number;
    custo_usd: number;
    latencia_ms: number;
  }): Promise<void> {
    const { error } = await this.client
      .schema(SCHEMA)
      .from("messages")
      .update({
        model_id: params.model_id,
        tokens_input: params.tokens_input,
        tokens_output: params.tokens_output,
        custo_usd: params.custo_usd,
        latencia_ms: params.latencia_ms,
      })
      .eq("id", params.message_id)
      .eq("tenant_id", params.tenant_id);

    if (error) throw new CostQueryError(`messages mirror falhou: ${error.message}`);
  }

  async fetchUsageRows(filters: {
    tenant_id?: string;
    model_id?: string;
    from: string;
    to: string;
  }): Promise<UsageLogAggregateRow[]> {
    let query = this.client
      .schema(SCHEMA)
      .from("model_usage_log")
      .select("model_id, tokens_input, tokens_output, custo_usd, latencia_ms, escalonou_para_humano")
      .gte("created_at", filters.from)
      .lte("created_at", filters.to)
      .limit(MAX_AGGREGATION_ROWS);

    if (filters.tenant_id) query = query.eq("tenant_id", filters.tenant_id);
    if (filters.model_id) query = query.eq("model_id", filters.model_id);

    const { data, error } = await query;
    if (error) throw new CostQueryError(`model_usage_log fetch falhou: ${error.message}`);

    return (data ?? []).map((r) => {
      const row = r as {
        model_id: string;
        tokens_input: number;
        tokens_output: number;
        custo_usd: number | string;
        latencia_ms: number;
        escalonou_para_humano: boolean;
      };
      return {
        model_id: row.model_id,
        tokens_input: row.tokens_input,
        tokens_output: row.tokens_output,
        custo_usd: Number(row.custo_usd),
        latencia_ms: row.latencia_ms,
        escalonou_para_humano: row.escalonou_para_humano,
      };
    });
  }

  async fetchProviders(modelIds: string[]): Promise<Map<string, ModelProvider>> {
    const uniques = [...new Set(modelIds)];
    if (uniques.length === 0) return new Map();

    const { data, error } = await this.client
      .schema(SCHEMA)
      .from("model_registry")
      .select("id, provider")
      .in("id", uniques);

    if (error) throw new CostQueryError(`model_registry providers fetch falhou: ${error.message}`);

    const map = new Map<string, ModelProvider>();
    for (const r of data ?? []) {
      const row = r as { id: string; provider: string };
      map.set(row.id, row.provider as ModelProvider);
    }
    return map;
  }
}
