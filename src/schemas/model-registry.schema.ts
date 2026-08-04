// Logos Iris — ModelGateway (model-gateway-v1)
// Validação Zod de todo input que cruza a fronteira do Service.
// Fonte canônica: docs/specs/model-gateway-v1.md + specs/api.contracts.ts (ModelGateway).

import { z } from "zod";

export const MODEL_PROVIDERS = [
  "glm",
  "kimi",
  "deepseek",
  "minimax",
  "nvidia_nim",
  "claude",
  "gpt4o",
  "groq",
] as const;

/** ADR-025 — nunca roteável para tier_do_plano="premium" (invariante checada no Service, defesa em profundidade). */
export const CHINESE_MODEL_PROVIDERS = ["glm", "kimi", "deepseek", "minimax"] as const;

export const MODEL_TASK_TYPES = [
  "triagem",
  "conversa_principal",
  "extracao_documento",
  "embeddings",
] as const;

export const PLAN_TIERS = ["basico", "premium"] as const;

// ── RouteModel (chamado internamente pela ConversationEngineService, sem HTTP) ──

export const modelRouteRequestSchema = z.object({
  tenant_id: z.uuid(),
  task_type: z.enum(MODEL_TASK_TYPES),
  tier_do_plano: z.enum(PLAN_TIERS),
});
export type ModelRouteRequest = z.infer<typeof modelRouteRequestSchema>;

// ── PUT /api/admin/model-registry/:id (admin-only) ──

export const modelRegistryPatchSchema = z
  .object({
    ativo: z.boolean().optional(),
    prioridade_fallback: z.number().int().positive().optional(),
    custo_por_1k_tokens_input: z.number().nonnegative().optional(),
    custo_por_1k_tokens_output: z.number().nonnegative().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "patch precisa de ao menos 1 campo (ativo, prioridade_fallback, custo_por_1k_tokens_input ou custo_por_1k_tokens_output)",
  });
export type ModelRegistryPatch = z.infer<typeof modelRegistryPatchSchema>;

export const updateModelRegistryEntrySchema = z.object({
  id: z.uuid(),
  patch: modelRegistryPatchSchema,
});
export type UpdateModelRegistryEntryParams = z.infer<typeof updateModelRegistryEntrySchema>;
