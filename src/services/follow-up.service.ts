// Logos Iris — Follow-ups (referência de uso do gate — feature-gating-v1, Requisito 3)
// A spec própria de Follow-up (wave 2, persona-vendas.md) ainda não existe; scheduleFollowUp existe
// aqui SÓ como caso concreto já contratado em api.contracts.ts, demonstrando o padrão exigido pela
// spec: Service chama CheckFeatureGate ANTES de escrever no Repository, e admin pula o gate
// inteiramente (Requisito 5, ADR-030) — mesmo padrão hardcoded de isAdmin() do model-gateway.

import { scheduleFollowUpSchema } from "@/schemas/feature-gating.schema";
import type { ScheduleFollowUpParams } from "@/schemas/feature-gating.schema";
import { isAdmin, FeatureGateService } from "@/services/feature-gating.service";
import type { FollowUpRepository } from "@/repositories/follow-up.repository";
import type { FollowUpDTO } from "@/types/follow-up.types";

export type ScheduleFollowUpResult = FollowUpDTO | { bloqueado: true; motivo: string };

export class FollowUpService {
  constructor(
    private readonly repo: FollowUpRepository,
    private readonly featureGate: FeatureGateService,
  ) {}

  /**
   * POST /api/follow-ups (referência) — Service layer checa CheckFeatureGate("follow_ups_automaticos_mes")
   * antes de criar (comentário em specs/api.contracts.ts, linha do ScheduleFollowUp). `callerUserId`
   * não faz parte do contrato HTTP (que só descreve os params de wire) — é resolvido pelo Controller
   * a partir do JWT e passado à parte, mesmo padrão de ModelGatewayService.listModelRegistry.
   */
  async scheduleFollowUp(callerUserId: string, input: ScheduleFollowUpParams): Promise<ScheduleFollowUpResult> {
    const params = scheduleFollowUpSchema.parse(input);

    // Requisito 5 — admin (Vinicius) contorna todo gate; pula CheckFeatureGate inteiramente.
    if (!isAdmin(callerUserId)) {
      const gate = await this.featureGate.checkFeatureGate({
        tenant_id: params.tenant_id,
        feature: "follow_ups_automaticos_mes",
      });

      if (!gate.permitido) {
        // Requisito 4 — ação abortada ANTES do Repository; resposta nunca é erro genérico.
        return { bloqueado: true, motivo: gate.motivo ?? "Limite do plano atingido" };
      }
    }

    return this.repo.create({
      tenantId: params.tenant_id,
      conversationId: params.conversation_id,
      agendadoPara: params.agendado_para,
    });
  }
}
