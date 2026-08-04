// Logos Iris — ModelGateway (model-gateway-v1)
// Toda a lógica de negócio do roteamento. Independente de protocolo (routeModel não é HTTP).
// Fora de escopo nesta v1 (ver docs/specs/model-gateway-v1.md): fallback dinâmico em runtime,
// circuit breaker (model_circuit_state), minimização de PII, custo/latência agregados.

import {
  CHINESE_MODEL_PROVIDERS,
  modelRouteRequestSchema,
  updateModelRegistryEntrySchema,
  type ModelRouteRequest,
  type UpdateModelRegistryEntryParams,
} from "@/schemas/model-registry.schema";
import type { ModelRegistryRepository } from "@/repositories/model-registry.repository";
import { ForbiddenAdminError, NoActiveModelError } from "@/services/model-gateway.errors";
import type { ModelRegistryEntryDTO, ModelRouteResult } from "@/types/model-gateway.types";

const CHINESE_PROVIDER_SET = new Set<string>(CHINESE_MODEL_PROVIDERS);

/** ADR-030 — admin hardcoded via env var (sem tabela de roles nesta fase). */
function isAdmin(callerUserId: string): boolean {
  const adminUserId = process.env.ADMIN_USER_ID;
  return Boolean(adminUserId) && callerUserId === adminUserId;
}

export class ModelGatewayService {
  constructor(private readonly repo: ModelRegistryRepository) {}

  /**
   * RouteModel — chamado internamente pela ConversationEngineService (não é endpoint HTTP).
   * Escolhe estaticamente o modelo ativo de maior prioridade para (task_type, tier); mesmo
   * algoritmo para qualquer task_type (Requisito 5 — nenhuma ramificação especial por tarefa).
   */
  async routeModel(input: ModelRouteRequest): Promise<ModelRouteResult> {
    const req = modelRouteRequestSchema.parse(input);
    const candidates = await this.repo.findActiveOrderedByTaskAndTier(req.task_type, req.tier_do_plano);

    const chosen = candidates.find((row) => this.passesInvariants(row, req.tier_do_plano));

    if (!chosen) {
      throw new NoActiveModelError(req.task_type, req.tier_do_plano);
    }

    return {
      model_id: chosen.id,
      provider: chosen.provider,
      model_name: chosen.model_name,
      // reflete a posição estática escolhida: prioridade_fallback da própria linha (nota da spec).
      fallback_chain_position: chosen.prioridade_fallback,
    };
  }

  /** GET /api/admin/model-registry — admin-only (ADR-030). */
  async listModelRegistry(callerUserId: string): Promise<ModelRegistryEntryDTO[]> {
    if (!isAdmin(callerUserId)) throw new ForbiddenAdminError();
    return this.repo.findAll();
  }

  /** PUT /api/admin/model-registry/:id — admin-only (ADR-030); efeito imediato, sem cache. */
  async updateModelRegistryEntry(
    callerUserId: string,
    input: UpdateModelRegistryEntryParams,
  ): Promise<ModelRegistryEntryDTO> {
    if (!isAdmin(callerUserId)) throw new ForbiddenAdminError();
    const { id, patch } = updateModelRegistryEntrySchema.parse(input);
    return this.repo.update(id, patch);
  }

  /** ADR-025 — defesa em profundidade: provedor chinês nunca roteia em tier premium, mesmo que o registry esteja mal configurado. */
  private passesInvariants(row: ModelRegistryEntryDTO, tier: "basico" | "premium"): boolean {
    if (tier === "premium" && CHINESE_PROVIDER_SET.has(row.provider)) {
      return false;
    }
    return true;
  }
}
