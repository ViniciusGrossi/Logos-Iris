// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)

import { z } from "zod";

// ── GET /api/dashboard/summary?data= (ISODateTime; opcional) ──
// SEM default calculado aqui (achado do /code-review, migração 0027): "hoje" nunca é decidido no
// cliente/Next.js (UTC) — quando `data` é omitido, o Repository passa null e o RPC
// iris.dashboard_summary calcula "hoje" no fuso do PRÓPRIO TENANT (tenants.timezone).
export const getDailySummaryQuerySchema = z.object({
  tenant_id: z.string().uuid(),
  data: z
    .string()
    .min(1)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "data precisa ser uma data ISO válida" })
    .optional(),
});
export type GetDailySummaryQuery = z.input<typeof getDailySummaryQuerySchema>;
