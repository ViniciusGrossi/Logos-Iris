// Logos Iris — CostObservabilityService (cost-observability-v1, ARCHITECTURE.md domínio Model)
// v1 mínima: persiste o custo/tokens/latência de cada chamada de modelo (síncrono à chamada, nunca
// job separado — Requisito 1) + leitura agregada admin-only (GetCostBreakdown). Fora de escopo
// (spec): alertas, dashboard, precificação, roteamento (model-gateway-v1).

import {
  computeCostUsd,
  getCostBreakdownSchema,
  logModelUsageSchema,
  type GetCostBreakdownParams,
  type LogModelUsageParams,
} from "@/schemas/cost-observability.schema";
import { isAdmin } from "@/services/feature-gating.service";
import { CostQueryError, ForbiddenAdminError, ModelRatesNotFoundError } from "@/services/cost-observability.errors";
import type { ModelUsageLogRepository } from "@/repositories/model-usage-log.repository";
import type { CostBreakdown, CostBreakdownPorModelo } from "@/types/cost-observability.types";

export class CostObservabilityService {
  constructor(private readonly repo: ModelUsageLogRepository) {}

  /**
   * Requisito 1/2/3/5 — chamado pelo ModelGateway DENTRO da própria chamada de modelo (precisa do
   * resultado real: tokens/latência). Grava em model_usage_log + espelha os campos na messages
   * correspondente. `custo_usd` é calculado das tarifas do model_registry AGORA e persistido — nunca
   * recalculado depois a partir do preço vigente.
   */
  async logModelUsage(input: LogModelUsageParams): Promise<{ custo_usd: number }> {
    const params = logModelUsageSchema.parse(input);

    const rates = await this.repo.getModelRates(params.model_id);
    if (!rates) throw new ModelRatesNotFoundError(params.model_id);

    const custo_usd = computeCostUsd({
      tokens_input: params.tokens_input,
      tokens_output: params.tokens_output,
      custo_por_1k_tokens_input: rates.custo_por_1k_tokens_input,
      custo_por_1k_tokens_output: rates.custo_por_1k_tokens_output,
    });

    await this.repo.insertUsage({
      tenant_id: params.tenant_id,
      conversation_id: params.conversation_id,
      model_id: params.model_id,
      tokens_input: params.tokens_input,
      tokens_output: params.tokens_output,
      custo_usd,
      latencia_ms: params.latencia_ms,
      escalonou_para_humano: params.escalonou_para_humano,
    });

    await this.repo.mirrorToMessage({
      message_id: params.message_id,
      tenant_id: params.tenant_id,
      model_id: params.model_id,
      tokens_input: params.tokens_input,
      tokens_output: params.tokens_output,
      custo_usd,
      latencia_ms: params.latencia_ms,
    });

    return { custo_usd };
  }

  /**
   * GET /api/admin/cost (Requisito 4/6) — admin-only (ADR-030). Agrega model_usage_log no período
   * (+ filtro opcional tenant_id/model_id) em memória a partir de UM fetch (sem N+1).
   */
  async getCostBreakdown(callerUserId: string, input: GetCostBreakdownParams): Promise<CostBreakdown> {
    if (!isAdmin(callerUserId)) throw new ForbiddenAdminError();
    const filters = getCostBreakdownSchema.parse(input);

    const rows = await this.repo.fetchUsageRows(filters);

    if (rows.length === 0) {
      return {
        total_custo_usd: 0,
        total_tokens_input: 0,
        total_tokens_output: 0,
        latencia_media_ms: 0,
        taxa_escalonamento: 0,
        quebra_por_modelo: [],
      };
    }

    const providers = await this.repo.fetchProviders(rows.map((r) => r.model_id));

    let totalCusto = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalLatencia = 0;
    let totalEscalou = 0;

    // model_id -> acumulador da quebra
    const porModelo = new Map<string, { custo: number; escalou: number; total: number }>();

    for (const r of rows) {
      totalCusto += r.custo_usd;
      totalIn += r.tokens_input;
      totalOut += r.tokens_output;
      totalLatencia += r.latencia_ms;
      if (r.escalonou_para_humano) totalEscalou += 1;

      const acc = porModelo.get(r.model_id) ?? { custo: 0, escalou: 0, total: 0 };
      acc.custo += r.custo_usd;
      acc.total += 1;
      if (r.escalonou_para_humano) acc.escalou += 1;
      porModelo.set(r.model_id, acc);
    }

    const quebra_por_modelo: CostBreakdownPorModelo[] = [...porModelo.entries()]
      .map(([model_id, acc]) => {
        const provider = providers.get(model_id);
        // model_usage_log.model_id é FK ON DELETE RESTRICT para model_registry — sempre resolve.
        if (!provider) throw new CostQueryError(`model_registry inconsistente: model_id "${model_id}" sem provider`);
        return {
          model_id,
          provider,
          custo_usd: round6(acc.custo),
          taxa_escalonamento: round4(acc.escalou / acc.total),
        };
      })
      .sort((a, b) => b.custo_usd - a.custo_usd);

    return {
      total_custo_usd: round6(totalCusto),
      total_tokens_input: totalIn,
      total_tokens_output: totalOut,
      latencia_media_ms: Math.round(totalLatencia / rows.length),
      taxa_escalonamento: round4(totalEscalou / rows.length),
      quebra_por_modelo,
    };
  }
}

const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
