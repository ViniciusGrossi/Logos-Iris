// Logos Iris — ModelGateway (model-gateway-v1)
// Único ponto de acesso a iris.model_registry. Sempre retorna ModelRegistryEntryDTO, nunca a row bruta.
// Tabela é global (sem tenant_id) e admin-only (RLS ON sem policy — service-role-only, ADR-018).
// Client injetado deve ser service-role (ver src/lib/supabase/service-client.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ModelRegistryPatch } from "@/schemas/model-registry.schema";
import { ModelRegistryEntryNotFoundError, ModelRegistryQueryError } from "@/services/model-gateway.errors";
import type { ModelRegistryEntryDTO, ModelTaskType, PlanTier } from "@/types/model-gateway.types";

export interface ModelRegistryRepository {
  /** Candidatos ativos para (task_type, tier), ordenados por prioridade_fallback crescente. */
  findActiveOrderedByTaskAndTier(taskType: ModelTaskType, tier: PlanTier): Promise<ModelRegistryEntryDTO[]>;
  /** GET /api/admin/model-registry — tabela de config pequena e global, sem paginação (gap aceito na spec). */
  findAll(): Promise<ModelRegistryEntryDTO[]>;
  update(id: string, patch: ModelRegistryPatch): Promise<ModelRegistryEntryDTO>;
}

interface ModelRegistryRow {
  id: string;
  provider: string;
  model_name: string;
  task_type: string;
  tier: string;
  prioridade_fallback: number;
  ativo: boolean;
  custo_por_1k_tokens_input: number | string;
  custo_por_1k_tokens_output: number | string;
}

const SCHEMA = "iris";
const TABLE = "model_registry";

function toDTO(row: ModelRegistryRow): ModelRegistryEntryDTO {
  return {
    id: row.id,
    provider: row.provider as ModelRegistryEntryDTO["provider"],
    model_name: row.model_name,
    task_type: row.task_type as ModelRegistryEntryDTO["task_type"],
    tier: row.tier as ModelRegistryEntryDTO["tier"],
    prioridade_fallback: row.prioridade_fallback,
    ativo: row.ativo,
    // numeric(10,6) do Postgres pode voltar como string no driver — normaliza para number.
    custo_por_1k_tokens_input: Number(row.custo_por_1k_tokens_input),
    custo_por_1k_tokens_output: Number(row.custo_por_1k_tokens_output),
  };
}

export class SupabaseModelRegistryRepository implements ModelRegistryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findActiveOrderedByTaskAndTier(taskType: ModelTaskType, tier: PlanTier): Promise<ModelRegistryEntryDTO[]> {
    const { data, error } = await this.client
      .schema(SCHEMA)
      .from(TABLE)
      .select("*")
      .eq("task_type", taskType)
      .eq("tier", tier)
      .eq("ativo", true)
      .order("prioridade_fallback", { ascending: true });

    if (error) throw new ModelRegistryQueryError(error.message);
    return (data ?? []).map(toDTO);
  }

  async findAll(): Promise<ModelRegistryEntryDTO[]> {
    const { data, error } = await this.client
      .schema(SCHEMA)
      .from(TABLE)
      .select("*")
      .order("task_type", { ascending: true })
      .order("tier", { ascending: true })
      .order("prioridade_fallback", { ascending: true });

    if (error) throw new ModelRegistryQueryError(error.message);
    return (data ?? []).map(toDTO);
  }

  async update(id: string, patch: ModelRegistryPatch): Promise<ModelRegistryEntryDTO> {
    const { data, error } = await this.client
      .schema(SCHEMA)
      .from(TABLE)
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw new ModelRegistryQueryError(error.message);
    if (!data) throw new ModelRegistryEntryNotFoundError(id);
    return toDTO(data as ModelRegistryRow);
  }
}
