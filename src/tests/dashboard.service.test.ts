import { describe, it, expect } from "vitest";

import { DashboardService } from "@/services/dashboard.service";
import type { DashboardSummaryRepository } from "@/repositories/dashboard-summary.repository";
import type { DailySummaryDTO } from "@/types/dashboard-summary.types";

const TENANT_A = "00000000-0000-4000-8000-00000000a001";

class FakeDashboardSummaryRepository implements DashboardSummaryRepository {
  calls: { tenantId: string; data?: string }[] = [];
  result: DailySummaryDTO = { total_conversas: 0, orcamentos_gerados: 0, agendamentos_criados: 0, leads_quentes: [] };

  async getDailySummary(tenantId: string, data?: string): Promise<DailySummaryDTO> {
    this.calls.push({ tenantId, data });
    return this.result;
  }
}

describe("DashboardService.getDailySummary — Requisito 5/6 (exatamente 4 campos do contrato)", () => {
  it("delega ao Repository com tenant_id e data validados", async () => {
    const repo = new FakeDashboardSummaryRepository();
    const service = new DashboardService(repo);

    await service.getDailySummary({ tenant_id: TENANT_A, data: "2026-09-25T12:00:00Z" });

    expect(repo.calls[0]).toEqual({ tenantId: TENANT_A, data: "2026-09-25T12:00:00Z" });
  });

  it("data é opcional — quando omitida, passa undefined ao Repository (RPC calcula 'hoje' no fuso do tenant, migração 0027)", async () => {
    const repo = new FakeDashboardSummaryRepository();
    const service = new DashboardService(repo);

    await service.getDailySummary({ tenant_id: TENANT_A });

    expect(repo.calls[0].data).toBeUndefined();
  });

  it("devolve exatamente os 4 campos do contrato (nenhum foraDoCatalogo)", async () => {
    const repo = new FakeDashboardSummaryRepository();
    repo.result = {
      total_conversas: 23,
      orcamentos_gerados: 4,
      agendamentos_criados: 2,
      leads_quentes: [{ conversation_id: "c1", resumo: "Lead quente" }],
    };
    const service = new DashboardService(repo);

    const result = await service.getDailySummary({ tenant_id: TENANT_A });

    expect(Object.keys(result).sort()).toEqual(
      ["total_conversas", "orcamentos_gerados", "agendamentos_criados", "leads_quentes"].sort()
    );
  });
});
