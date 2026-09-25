// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// DashboardService: GetDailySummary (Requisitos 5/6).

import { getDailySummaryQuerySchema, type GetDailySummaryQuery } from "@/schemas/dashboard-summary.schema";
import type { DashboardSummaryRepository } from "@/repositories/dashboard-summary.repository";
import type { DailySummaryDTO } from "@/types/dashboard-summary.types";

export class DashboardService {
  constructor(private readonly repo: DashboardSummaryRepository) {}

  async getDailySummary(input: GetDailySummaryQuery): Promise<DailySummaryDTO> {
    const params = getDailySummaryQuerySchema.parse(input);
    return this.repo.getDailySummary(params.tenant_id, params.data);
  }
}
