// Logos Iris — Feature Gating (feature-gating-v1)
// Toda a lógica de negócio do gate de plano. Independente de protocolo (checkFeatureGate não é
// HTTP — Requisito 1). Fora de escopo nesta v1 (ver docs/specs/feature-gating-v1.md): enforcement
// de qualquer PlanFeatures além de follow_ups_automaticos_mes (caso de referência já contratado).

import { checkFeatureGateSchema, getCurrentPlanFeaturesQuerySchema } from "@/schemas/feature-gating.schema";
import type { CheckFeatureGateParams } from "@/schemas/feature-gating.schema";
import { FeatureGateNotImplementedError, TenantPlanNotFoundError } from "@/services/feature-gating.errors";
import type { PlanRepository, UsageRepository } from "@/repositories/feature-gating.repository";
import type { CheckFeatureGateResult, GetCurrentPlanFeaturesResult } from "@/types/feature-gating.types";

/**
 * ADR-030 — admin hardcoded via env var (sem tabela de roles nesta fase), mesmo padrão de
 * src/services/model-gateway.service.ts (`isAdmin`). Reusado por toda Service que precisa pular o
 * gate de plano para o admin (Requisito 5) — ex.: FollowUpService.scheduleFollowUp.
 */
export function isAdmin(callerUserId: string): boolean {
  const adminUserId = process.env.ADMIN_USER_ID;
  return Boolean(adminUserId) && callerUserId === adminUserId;
}

export class FeatureGateService {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly usageRepo: UsageRepository,
  ) {}

  /**
   * CheckFeatureGate — chamada internamente por outras Services antes de qualquer ação limitada
   * por plano (Requisito 1/3). Nunca lança erro genérico quando bloqueado: retorna
   * { permitido: false, motivo } (Requisito 4) — o chamador decide o que fazer com isso.
   *
   * Admin bypass (Requisito 5) NÃO vive aqui: é a Service chamadora (ex.: FollowUpService) que
   * checa `isAdmin(callerUserId)` e decide pular esta chamada inteiramente — CheckFeatureGate em
   * si não recebe identidade de chamador (mesma forma do contrato em specs/api.contracts.ts).
   */
  async checkFeatureGate(input: CheckFeatureGateParams): Promise<CheckFeatureGateResult> {
    const { tenant_id, feature } = checkFeatureGateSchema.parse(input);

    const plan = await this.planRepo.findPlanFeaturesByTenantId(tenant_id);
    if (!plan) throw new TenantPlanNotFoundError(tenant_id);

    switch (feature) {
      case "follow_ups_automaticos_mes": {
        const limite = plan.features.follow_ups_automaticos_mes;
        const usados = await this.usageRepo.countFollowUpsThisMonth(tenant_id);

        if (usados >= limite) {
          return {
            permitido: false,
            motivo: `Limite mensal de follow-ups automáticos atingido (${usados}/${limite}). Faça upgrade do plano para continuar.`,
          };
        }
        return { permitido: true };
      }

      default:
        // Fora de escopo v1 (spec, seção "Fora de Escopo"): as demais chaves de PlanFeatures não
        // têm enforcement ainda — falha alto e claro, nunca permite a ação silenciosamente.
        throw new FeatureGateNotImplementedError(feature);
    }
  }

  /** GET /api/plan/features — painel cliente, só leitura, NUNCA aplica gate (Requisito 2). */
  async getCurrentPlanFeatures(tenantId: string): Promise<GetCurrentPlanFeaturesResult> {
    const { tenant_id } = getCurrentPlanFeaturesQuerySchema.parse({ tenant_id: tenantId });

    const plan = await this.planRepo.findPlanFeaturesByTenantId(tenant_id);
    if (!plan) throw new TenantPlanNotFoundError(tenant_id);

    const uso_atual = await this.usageRepo.getUsageSnapshot(tenant_id);

    return { plano_nome: plan.planoNome, features: plan.features, uso_atual };
  }
}
