// Logos Iris — Feature Gating (feature-gating-v1)
// Único ponto de acesso a iris.plans / iris.tenants / iris.messages / iris.whatsapp_connections /
// iris.follow_ups para fins de gate de plano e reflexo de uso no painel. Sempre retorna DTOs
// tipados, nunca a row bruta. Client injetado é service-role (ADR-018/ADR-030) — mesmo padrão de
// knowledge-base.repository.ts / tenant-lookup.repository.ts: RLS cobre o caminho direto ao
// Postgres, o filtro explícito por tenant_id/id no WHERE é quem garante isolamento no caminho de
// app (defesa em profundidade).
//
// Dois repositórios lógicos (ARCHITECTURE.md — domínio Billing: PlanRepo, UsageRepo), um único
// arquivo por serem pequenos e sempre consumidos juntos pelo FeatureGateService.

import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { PlanQueryError, UsageQueryError } from "@/services/feature-gating.errors";
import type { PlanFeatures, PlanFeaturesForTenant, UsageSnapshot } from "@/types/feature-gating.types";

interface PlanRow {
  nome: string;
  max_personas_ativas: number;
  roteador_invisivel_incluso: boolean;
  tier_modelo: string;
  limite_mensagens_mes: number;
  retencao_memoria_dias: number;
  follow_ups_automaticos_mes: number;
  auditoria_qualidade_incluida: boolean;
  seats_painel: number;
  api_oficial_meta_addon_disponivel: boolean;
  voz_clonada_addon_disponivel: boolean;
}

function toPlanFeatures(row: PlanRow): PlanFeatures {
  return {
    max_personas_ativas: row.max_personas_ativas,
    roteador_invisivel_incluso: row.roteador_invisivel_incluso,
    tier_modelo: row.tier_modelo as PlanFeatures["tier_modelo"],
    limite_mensagens_mes: row.limite_mensagens_mes,
    retencao_memoria_dias: row.retencao_memoria_dias,
    follow_ups_automaticos_mes: row.follow_ups_automaticos_mes,
    auditoria_qualidade_incluida: row.auditoria_qualidade_incluida,
    seats_painel: row.seats_painel,
    api_oficial_meta_addon_disponivel: row.api_oficial_meta_addon_disponivel,
    voz_clonada_addon_disponivel: row.voz_clonada_addon_disponivel,
  };
}

/** Início do mês corrente em UTC — mesma janela usada pelas partições mensais de iris.messages (0006). */
export function startOfCurrentMonthISO(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ── PlanRepository ──────────────────────────────────────────────────────────

export interface PlanRepository {
  /** Resolve o plano do tenant via tenants.plano_id -> plans. null se tenant/plano não existir. */
  findPlanFeaturesByTenantId(tenantId: string): Promise<PlanFeaturesForTenant | null>;
}

export class SupabasePlanRepository implements PlanRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async findPlanFeaturesByTenantId(tenantId: string): Promise<PlanFeaturesForTenant | null> {
    const { data: tenant, error: tenantError } = await this.db
      .from("tenants")
      .select("plano_id")
      .eq("id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();

    if (tenantError) throw new PlanQueryError(tenantError.message);
    if (!tenant) return null;

    const { data: plan, error: planError } = await this.db
      .from("plans")
      .select("*")
      .eq("id", (tenant as { plano_id: string }).plano_id)
      .maybeSingle();

    if (planError) throw new PlanQueryError(planError.message);
    if (!plan) return null;

    const row = plan as unknown as PlanRow;
    return { planoNome: row.nome, features: toPlanFeatures(row) };
  }
}

// ── UsageRepository ─────────────────────────────────────────────────────────

export interface UsageRepository {
  /** UsageSnapshot calculado em request-time — sem snapshot pré-computado nesta v1. */
  getUsageSnapshot(tenantId: string): Promise<UsageSnapshot>;
  /** Contagem de follow_ups criados no mês corrente — insumo do gate follow_ups_automaticos_mes. */
  countFollowUpsThisMonth(tenantId: string): Promise<number>;
}

export class SupabaseUsageRepository implements UsageRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async getUsageSnapshot(tenantId: string): Promise<UsageSnapshot> {
    const monthStart = startOfCurrentMonthISO();

    const [mensagens, tenantRow, conexoes] = await Promise.all([
      this.db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", monthStart),
      this.db.from("tenants").select("personas_ativas").eq("id", tenantId).is("deleted_at", null).maybeSingle(),
      this.db
        .from("whatsapp_connections")
        .select("tenant_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("session_status", "conectado"),
    ]);

    if (mensagens.error) throw new UsageQueryError(mensagens.error.message);
    if (tenantRow.error) throw new UsageQueryError(tenantRow.error.message);
    if (conexoes.error) throw new UsageQueryError(conexoes.error.message);

    const personasAtivas = (tenantRow.data as { personas_ativas: string[] } | null)?.personas_ativas ?? [];

    return {
      mensagens_mes_atual: mensagens.count ?? 0,
      personas_ativas_count: personasAtivas.length,
      numeros_conectados: conexoes.count ?? 0,
    };
  }

  async countFollowUpsThisMonth(tenantId: string): Promise<number> {
    const monthStart = startOfCurrentMonthISO();

    const { count, error } = await this.db
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", monthStart);

    if (error) throw new UsageQueryError(error.message);
    return count ?? 0;
  }
}
