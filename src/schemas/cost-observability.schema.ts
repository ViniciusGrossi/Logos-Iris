// Logos Iris — cost-observability-v1 (docs/specs/cost-observability-v1.md)
// Validação Zod de todo input que cruza a fronteira do CostObservabilityService (_shared.md §4).

import { z } from "zod";

const uuidSchema = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });

export const logModelUsageSchema = z.object({
  tenant_id: uuidSchema,
  conversation_id: uuidSchema,
  model_id: uuidSchema,
  message_id: uuidSchema,
  tokens_input: z.number().int().nonnegative(),
  tokens_output: z.number().int().nonnegative(),
  latencia_ms: z.number().int().nonnegative(),
  escalonou_para_humano: z.boolean(),
});
export type LogModelUsageParams = z.infer<typeof logModelUsageSchema>;

export const getCostBreakdownSchema = z
  .object({
    tenant_id: uuidSchema.optional(),
    model_id: uuidSchema.optional(),
    from: isoDateTime,
    to: isoDateTime,
  })
  .refine((v) => Date.parse(v.from) <= Date.parse(v.to), {
    message: "`from` deve ser <= `to`",
    path: ["from"],
  });
export type GetCostBreakdownParams = z.infer<typeof getCostBreakdownSchema>;

/**
 * Requisito 2 — custo em USD a partir das tarifas do model_registry NO MOMENTO da chamada.
 * numeric(10,6) no Postgres → arredonda para 6 casas para bater com a coluna.
 */
export function computeCostUsd(params: {
  tokens_input: number;
  tokens_output: number;
  custo_por_1k_tokens_input: number;
  custo_por_1k_tokens_output: number;
}): number {
  const bruto =
    (params.tokens_input / 1000) * params.custo_por_1k_tokens_input +
    (params.tokens_output / 1000) * params.custo_por_1k_tokens_output;
  return Math.round(bruto * 1_000_000) / 1_000_000;
}
