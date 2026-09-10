// Logos Iris — Feature Gating (feature-gating-v1)
// Validação Zod de todo input que cruza a fronteira do Service.
// Fonte canônica: docs/specs/feature-gating-v1.md + specs/api.contracts.ts (seção "Feature Gating").

import { z } from "zod";

/** As 10 chaves de PlanFeatures (iris.plans) — única fonte, reusada pelo tipo PlanFeatureKey. */
export const PLAN_FEATURE_KEYS = [
  "max_personas_ativas",
  "roteador_invisivel_incluso",
  "tier_modelo",
  "limite_mensagens_mes",
  "retencao_memoria_dias",
  "follow_ups_automaticos_mes",
  "auditoria_qualidade_incluida",
  "seats_painel",
  "api_oficial_meta_addon_disponivel",
  "voz_clonada_addon_disponivel",
] as const;

// ── CheckFeatureGate (chamado internamente pelos Services, não é endpoint HTTP) ──

export const checkFeatureGateSchema = z.object({
  tenant_id: z.uuid(),
  feature: z.enum(PLAN_FEATURE_KEYS),
});
export type CheckFeatureGateParams = z.infer<typeof checkFeatureGateSchema>;

// ── GET /api/plan/features (painel cliente — reflete o gate, nunca aplica) ──

export const getCurrentPlanFeaturesQuerySchema = z.object({
  tenant_id: z.uuid(),
});
export type GetCurrentPlanFeaturesQuery = z.infer<typeof getCurrentPlanFeaturesQuerySchema>;

// ── ScheduleFollowUp — referência de uso do gate (Requisito 3); spec própria de Follow-up é
// wave 2 (persona-vendas.md), citada aqui só como caso concreto já contratado em api.contracts.ts. ──

export const scheduleFollowUpSchema = z.object({
  tenant_id: z.uuid(),
  conversation_id: z.uuid(),
  agendado_para: z.iso.datetime({ offset: true }),
});
export type ScheduleFollowUpParams = z.infer<typeof scheduleFollowUpSchema>;
