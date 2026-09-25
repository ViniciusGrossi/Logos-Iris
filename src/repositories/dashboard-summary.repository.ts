import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { DashboardQueryError } from "@/services/dashboard.errors";
import type { DailySummaryDTO } from "@/types/dashboard-summary.types";

interface DashboardSummaryRow {
  total_conversas: number;
  orcamentos_gerados: number;
  agendamentos_criados: number;
  leads_quentes: { conversation_id: string; resumo: string }[];
}

export interface DashboardSummaryRepository {
  /**
   * `data` opcional — quando ausente, "hoje" é calculado DENTRO do RPC no fuso do próprio tenant
   * (migração 0027, achado do /code-review: nunca decidir "hoje" no cliente/UTC).
   */
  getDailySummary(tenantId: string, data?: string): Promise<DailySummaryDTO>;
}

export class SupabaseDashboardSummaryRepository implements DashboardSummaryRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async getDailySummary(tenantId: string, data?: string): Promise<DailySummaryDTO> {
    // `data` chega como ISODateTime (contrato) — a RPC espera `date`; truncar aqui é a única
    // conversão de formato quando o caller passa uma data explícita. Sem `data`, passa null e o
    // RPC decide "hoje" sozinho (fuso do tenant), nunca um default calculado aqui.
    const dataOnly = data ? data.slice(0, 10) : null;

    // @ts-expect-error — "dashboard_summary" é RPC nova (migração 0026/0027), ainda não está em
    // database.types.ts.
    const { data: rows, error } = (await this.db.rpc("dashboard_summary", {
      p_tenant_id: tenantId,
      p_data: dataOnly,
    })) as { data: DashboardSummaryRow[] | null; error: { message: string } | null };

    if (error) throw new DashboardQueryError(error.message);
    const row = rows?.[0];
    if (!row) throw new DashboardQueryError("dashboard_summary não retornou nenhuma linha");

    return {
      total_conversas: row.total_conversas,
      orcamentos_gerados: row.orcamentos_gerados,
      agendamentos_criados: row.agendamentos_criados,
      leads_quentes: row.leads_quentes,
    };
  }
}
