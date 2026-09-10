// Logos Iris — feature-gating-v1
// Test cases derivados 1:1 dos Critérios de Aceite em docs/specs/feature-gating-v1.md.
// Repositories são fakes (fixture em memória, mesmo padrão de model-gateway-v1.test.ts /
// knowledge-base-v1.test.ts) para os testes de Service; testes separados de repository real usam
// spy da chain do client Supabase (mesmo padrão de tenant-lookup.repository.test.ts) pra travar o
// filtro de tenant_id no WHERE (defesa em profundidade além do RLS).

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { SupabasePlanRepository, SupabaseUsageRepository, startOfCurrentMonthISO } from "@/repositories/feature-gating.repository";
import type { PlanRepository, UsageRepository } from "@/repositories/feature-gating.repository";
import { SupabaseFollowUpRepository } from "@/repositories/follow-up.repository";
import type { FollowUpRepository } from "@/repositories/follow-up.repository";
import {
  FeatureGateNotImplementedError,
  FollowUpQueryError,
  PlanQueryError,
  TenantPlanNotFoundError,
  UsageQueryError,
} from "@/services/feature-gating.errors";
import { FeatureGateService } from "@/services/feature-gating.service";
import { FollowUpService } from "@/services/follow-up.service";
import type { FollowUpDTO } from "@/types/follow-up.types";
import type { PlanFeatures, PlanFeaturesForTenant, UsageSnapshot } from "@/types/feature-gating.types";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000b2";

function makePlanFeatures(overrides: Partial<PlanFeatures> = {}): PlanFeatures {
  return {
    max_personas_ativas: 2,
    roteador_invisivel_incluso: true,
    tier_modelo: "basico",
    limite_mensagens_mes: 1000,
    retencao_memoria_dias: 90,
    follow_ups_automaticos_mes: 5,
    auditoria_qualidade_incluida: false,
    seats_painel: 1,
    api_oficial_meta_addon_disponivel: false,
    voz_clonada_addon_disponivel: false,
    ...overrides,
  };
}

// ── Fakes — Service tests (lógica pura, sem I/O) ────────────────────────────

class FakePlanRepository implements PlanRepository {
  plans = new Map<string, PlanFeaturesForTenant>();

  async findPlanFeaturesByTenantId(tenantId: string): Promise<PlanFeaturesForTenant | null> {
    return this.plans.get(tenantId) ?? null;
  }
}

class FakeUsageRepository implements UsageRepository {
  snapshots = new Map<string, UsageSnapshot>();
  followUpCounts = new Map<string, number>();

  async getUsageSnapshot(tenantId: string): Promise<UsageSnapshot> {
    return this.snapshots.get(tenantId) ?? { mensagens_mes_atual: 0, personas_ativas_count: 0, numeros_conectados: 0 };
  }

  async countFollowUpsThisMonth(tenantId: string): Promise<number> {
    return this.followUpCounts.get(tenantId) ?? 0;
  }
}

class FakeFollowUpRepository implements FollowUpRepository {
  rows: (FollowUpDTO & { tenantId: string })[] = [];

  async create(params: { tenantId: string; conversationId: string; agendadoPara: string }): Promise<FollowUpDTO> {
    const row = { id: randomUUID(), conversation_id: params.conversationId, agendado_para: params.agendadoPara, status: "pendente" as const, tenantId: params.tenantId };
    this.rows.push(row);
    const { tenantId: _t, ...dto } = row;
    return dto;
  }
}

function makeFeatureGateService() {
  const planRepo = new FakePlanRepository();
  const usageRepo = new FakeUsageRepository();
  const service = new FeatureGateService(planRepo, usageRepo);
  return { planRepo, usageRepo, service };
}

beforeEach(() => {
  process.env.ADMIN_USER_ID = ADMIN_ID;
});

// ── AC1/AC2 — CheckFeatureGate("follow_ups_automaticos_mes") ───────────────

describe("FeatureGateService.checkFeatureGate — Requisito 1/3 (follow_ups_automaticos_mes)", () => {
  it("Given follow_ups_automaticos_mes=5 e 5 já criados no mês, When checkFeatureGate, Then permitido=false com motivo", async () => {
    const { planRepo, usageRepo, service } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 5);

    const result = await service.checkFeatureGate({ tenant_id: TENANT_A, feature: "follow_ups_automaticos_mes" });

    expect(result.permitido).toBe(false);
    expect(result.motivo).toBeTruthy();
    expect(typeof result.motivo).toBe("string");
  });

  it("Given o mesmo tenant com 3 follow-ups no mês, When checkFeatureGate, Then permitido=true", async () => {
    const { planRepo, usageRepo, service } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 3);

    const result = await service.checkFeatureGate({ tenant_id: TENANT_A, feature: "follow_ups_automaticos_mes" });

    expect(result).toEqual({ permitido: true });
  });

  it("tenant sem plano resolvido (defesa em profundidade) lança TenantPlanNotFoundError, nunca objeto parcial", async () => {
    const { service } = makeFeatureGateService();

    await expect(
      service.checkFeatureGate({ tenant_id: TENANT_A, feature: "follow_ups_automaticos_mes" }),
    ).rejects.toBeInstanceOf(TenantPlanNotFoundError);
  });

  it("rejeita tenant_id que não é UUID (validação Zod na fronteira do Service)", async () => {
    const { service } = makeFeatureGateService();

    await expect(
      service.checkFeatureGate({ tenant_id: "not-a-uuid", feature: "follow_ups_automaticos_mes" }),
    ).rejects.toThrow();
  });

  it("rejeita feature fora do enum PlanFeatures", async () => {
    const { service } = makeFeatureGateService();

    await expect(
      // @ts-expect-error — feature inválida de propósito
      service.checkFeatureGate({ tenant_id: TENANT_A, feature: "campo_inexistente" }),
    ).rejects.toThrow();
  });

  it.each(["max_personas_ativas", "seats_painel", "voz_clonada_addon_disponivel", "api_oficial_meta_addon_disponivel", "auditoria_qualidade_incluida"] as const)(
    "feature %s ainda fora de escopo v1 — lança FeatureGateNotImplementedError, nunca permite silenciosamente",
    async (feature) => {
      const { planRepo, service } = makeFeatureGateService();
      planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures() });

      await expect(service.checkFeatureGate({ tenant_id: TENANT_A, feature })).rejects.toBeInstanceOf(
        FeatureGateNotImplementedError,
      );
    },
  );
});

// ── AC3 — GetCurrentPlanFeatures (painel cliente, só leitura) ───────────────

describe("FeatureGateService.getCurrentPlanFeatures — Requisito 2", () => {
  it("Given tenant autenticado, When GetCurrentPlanFeatures, Then retorna plano_nome + features completo + uso_atual, sem bloquear nada", async () => {
    const { planRepo, usageRepo, service } = makeFeatureGateService();
    const features = makePlanFeatures({ follow_ups_automaticos_mes: 5 });
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features });
    usageRepo.snapshots.set(TENANT_A, { mensagens_mes_atual: 120, personas_ativas_count: 2, numeros_conectados: 1 });
    usageRepo.followUpCounts.set(TENANT_A, 5); // no limite — leitura nunca aplica gate mesmo assim

    const result = await service.getCurrentPlanFeatures(TENANT_A);

    expect(result.plano_nome).toBe("Essencial");
    expect(result.features).toEqual(features);
    expect(result.uso_atual).toEqual({ mensagens_mes_atual: 120, personas_ativas_count: 2, numeros_conectados: 1 });
  });

  it("tenant sem plano encontrado lança TenantPlanNotFoundError (retorna erro, nunca objeto vazio silencioso)", async () => {
    const { service } = makeFeatureGateService();

    await expect(service.getCurrentPlanFeatures(TENANT_A)).rejects.toBeInstanceOf(TenantPlanNotFoundError);
  });

  it("rejeita tenant_id que não é UUID", async () => {
    const { service } = makeFeatureGateService();

    await expect(service.getCurrentPlanFeatures("not-a-uuid")).rejects.toThrow();
  });
});

// ── RLS/isolamento — tenant A nunca acessa recurso do tenant B (protocolo _shared.md §3) ───

describe("FeatureGateService — isolamento multi-tenant (Requisito 6)", () => {
  it("getCurrentPlanFeatures(tenant A) e (tenant B) nunca cruzam dado, mesmo com os dois cadastrados", async () => {
    const { planRepo, usageRepo, service } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ max_personas_ativas: 1 }) });
    planRepo.plans.set(TENANT_B, { planoNome: "Premium", features: makePlanFeatures({ max_personas_ativas: 5 }) });
    usageRepo.snapshots.set(TENANT_A, { mensagens_mes_atual: 10, personas_ativas_count: 1, numeros_conectados: 1 });
    usageRepo.snapshots.set(TENANT_B, { mensagens_mes_atual: 999, personas_ativas_count: 4, numeros_conectados: 1 });

    const resultA = await service.getCurrentPlanFeatures(TENANT_A);
    const resultB = await service.getCurrentPlanFeatures(TENANT_B);

    expect(resultA.plano_nome).toBe("Essencial");
    expect(resultA.uso_atual.mensagens_mes_atual).toBe(10);
    expect(resultB.plano_nome).toBe("Premium");
    expect(resultB.uso_atual.mensagens_mes_atual).toBe(999);
  });

  it("checkFeatureGate do tenant A nunca lê o uso do tenant B mesmo que ambos estejam no limite", async () => {
    const { planRepo, usageRepo, service } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    planRepo.plans.set(TENANT_B, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 1); // longe do limite
    usageRepo.followUpCounts.set(TENANT_B, 5); // no limite

    const resultA = await service.checkFeatureGate({ tenant_id: TENANT_A, feature: "follow_ups_automaticos_mes" });
    const resultB = await service.checkFeatureGate({ tenant_id: TENANT_B, feature: "follow_ups_automaticos_mes" });

    expect(resultA.permitido).toBe(true);
    expect(resultB.permitido).toBe(false);
  });
});

// ── AC4/AC5 — Admin bypass hardcoded (ADR-030), demonstrado via ScheduleFollowUp ────────────

describe("FollowUpService.scheduleFollowUp — Requisito 3/4/5 (caso de referência do gate)", () => {
  function makeFollowUpService(planRepo: FakePlanRepository, usageRepo: FakeUsageRepository) {
    const followUpRepo = new FakeFollowUpRepository();
    const featureGate = new FeatureGateService(planRepo, usageRepo);
    const service = new FollowUpService(followUpRepo, featureGate);
    return { followUpRepo, service };
  }

  it("Given tenant no limite (5/5), When scheduleFollowUp por usuário comum, Then retorna { bloqueado: true, motivo } e NADA é criado no Repository", async () => {
    const { planRepo, usageRepo } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 5);
    const { followUpRepo, service } = makeFollowUpService(planRepo, usageRepo);

    const result = await service.scheduleFollowUp(OTHER_USER_ID, {
      tenant_id: TENANT_A,
      conversation_id: randomUUID(),
      agendado_para: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).toEqual({ bloqueado: true, motivo: expect.any(String) });
    expect(followUpRepo.rows).toHaveLength(0); // Requisito 3 — nunca escreve no Repository quando bloqueado
  });

  it("Given tenant abaixo do limite, When scheduleFollowUp, Then cria o follow_up normalmente", async () => {
    const { planRepo, usageRepo } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 2);
    const { followUpRepo, service } = makeFollowUpService(planRepo, usageRepo);

    const result = await service.scheduleFollowUp(OTHER_USER_ID, {
      tenant_id: TENANT_A,
      conversation_id: randomUUID(),
      agendado_para: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).not.toHaveProperty("bloqueado");
    expect(followUpRepo.rows).toHaveLength(1);
  });

  it("Given rota admin com auth.uid()=VINICIUS_UUID e tenant NO limite, When scheduleFollowUp, Then CheckFeatureGate é pulado e o follow_up é criado mesmo assim", async () => {
    const { planRepo, usageRepo } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 5); // já no limite — só passa se o gate foi pulado
    const { followUpRepo, service } = makeFollowUpService(planRepo, usageRepo);

    const result = await service.scheduleFollowUp(ADMIN_ID, {
      tenant_id: TENANT_A,
      conversation_id: randomUUID(),
      agendado_para: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).not.toHaveProperty("bloqueado");
    expect(followUpRepo.rows).toHaveLength(1);
  });

  it("Given auth.uid() diferente do admin hardcoded, When scheduleFollowUp com tenant no limite, Then NÃO é tratado como admin — permanece bloqueado", async () => {
    const { planRepo, usageRepo } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 5);
    const { followUpRepo, service } = makeFollowUpService(planRepo, usageRepo);

    const result = await service.scheduleFollowUp(OTHER_USER_ID, {
      tenant_id: TENANT_A,
      conversation_id: randomUUID(),
      agendado_para: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).toEqual({ bloqueado: true, motivo: expect.any(String) });
    expect(followUpRepo.rows).toHaveLength(0);
  });

  it("sem ADMIN_USER_ID configurado, nenhum caller é tratado como admin (fail-closed)", async () => {
    delete process.env.ADMIN_USER_ID;
    const { planRepo, usageRepo } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 5);
    const { followUpRepo, service } = makeFollowUpService(planRepo, usageRepo);

    const result = await service.scheduleFollowUp(ADMIN_ID, {
      tenant_id: TENANT_A,
      conversation_id: randomUUID(),
      agendado_para: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).toEqual({ bloqueado: true, motivo: expect.any(String) });
    expect(followUpRepo.rows).toHaveLength(0);
  });

  it("rejeita agendado_para que não é ISO datetime válido", async () => {
    const { planRepo, usageRepo } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures() });
    const { service } = makeFollowUpService(planRepo, usageRepo);

    await expect(
      service.scheduleFollowUp(OTHER_USER_ID, {
        tenant_id: TENANT_A,
        conversation_id: randomUUID(),
        agendado_para: "amanhã de manhã",
      }),
    ).rejects.toThrow();
  });
});

// ── "Nenhum erro em console/logs" (critério de aceite explícito) ───────────

describe("Feature Gating — sem erro em console (critério de aceite)", () => {
  it("fluxo normal (permitido e bloqueado) nunca chama console.error/console.warn", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { planRepo, usageRepo, service } = makeFeatureGateService();
    planRepo.plans.set(TENANT_A, { planoNome: "Essencial", features: makePlanFeatures({ follow_ups_automaticos_mes: 5 }) });
    usageRepo.followUpCounts.set(TENANT_A, 5);

    await service.checkFeatureGate({ tenant_id: TENANT_A, feature: "follow_ups_automaticos_mes" });
    await service.getCurrentPlanFeatures(TENANT_A);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ── Repository real — spy da chain do client Supabase trava o filtro tenant_id no WHERE ────
// Mesmo padrão de tenant-lookup.repository.test.ts / knowledge-base-v1.test.ts: client injetado é
// service-role, então o app-level filter é quem garante isolamento no caminho de app (RLS cobre o
// caminho direto ao Postgres).

type ChainCall = { method: string; args: unknown[] };

/**
 * Chain "thenable": suporta tanto `.maybeSingle()` (queries de linha única) quanto `await` direto
 * na chain (queries `{count:'exact', head:true}`, que nunca chamam `.maybeSingle()`).
 */
function buildChainSpy(result: { data: unknown; error: unknown; count?: number }) {
  const calls: ChainCall[] = [];
  const chain: Record<string, unknown> = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return chain;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return chain;
    },
    gte(...args: unknown[]) {
      calls.push({ method: "gte", args });
      return chain;
    },
    is(...args: unknown[]) {
      calls.push({ method: "is", args });
      return chain;
    },
    insert(...args: unknown[]) {
      calls.push({ method: "insert", args });
      return chain;
    },
    maybeSingle: async () => ({ data: result.data, error: result.error ?? null }),
    then(resolve: (value: unknown) => void) {
      resolve({ data: result.data, error: result.error ?? null, count: result.count });
    },
  };
  return { chain, calls };
}

describe("SupabasePlanRepository — filtro de tenant_id/id nas queries (Requisito 6)", () => {
  it("findPlanFeaturesByTenantId aplica .eq('id', tenantId) em tenants e .eq('id', plano_id) em plans", async () => {
    const calls: ChainCall[] = [];
    const planRow = { nome: "Essencial", ...makePlanFeatures() };

    function wrap(table: string, data: unknown) {
      const w: Record<string, unknown> = {
        select: (...a: unknown[]) => { calls.push({ method: "select", args: a }); return w; },
        eq: (...a: unknown[]) => { calls.push({ method: "eq", args: a }); return w; },
        is: (...a: unknown[]) => { calls.push({ method: "is", args: a }); return w; },
        maybeSingle: async () => ({ data, error: null }),
      };
      return w;
    }

    const db = {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        if (table === "tenants") return wrap(table, { plano_id: "plan-1" });
        if (table === "plans") return wrap(table, planRow);
        throw new Error(`tabela inesperada: ${table}`);
      },
    };
    const repo = new SupabasePlanRepository(db as unknown as IrisSupabaseClient);

    const result = await repo.findPlanFeaturesByTenantId(TENANT_A);

    expect(result?.planoNome).toBe("Essencial");
    expect(calls).toContainEqual({ method: "from", args: ["tenants"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", TENANT_A] });
    expect(calls).toContainEqual({ method: "from", args: ["plans"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", "plan-1"] });
  });

  it("tenant inexistente retorna null (nunca lança e nunca inventa plano)", async () => {
    const { chain } = buildChainSpy({ data: null, error: null });
    const db = { from: () => chain };
    const repo = new SupabasePlanRepository(db as unknown as IrisSupabaseClient);

    const result = await repo.findPlanFeaturesByTenantId(TENANT_A);

    expect(result).toBeNull();
  });

  it("propaga erro do client como PlanQueryError tipado (nunca throw genérico)", async () => {
    const { chain } = buildChainSpy({ data: null, error: { message: "conexão recusada" } });
    const db = { from: () => chain };
    const repo = new SupabasePlanRepository(db as unknown as IrisSupabaseClient);

    await expect(repo.findPlanFeaturesByTenantId(TENANT_A)).rejects.toBeInstanceOf(PlanQueryError);
  });
});

describe("SupabaseUsageRepository — filtro de tenant_id + janela do mês corrente (Requisito 2)", () => {
  it("getUsageSnapshot aplica eq('tenant_id', ...) em messages/whatsapp_connections e gte('created_at', início do mês) em messages", async () => {
    const calls: ChainCall[] = [];
    function wrap(table: string, result: { data: unknown; error: unknown; count?: number }) {
      const w: Record<string, unknown> = {
        select: (...a: unknown[]) => { calls.push({ method: "select", args: [table, ...a] }); return w; },
        eq: (...a: unknown[]) => { calls.push({ method: "eq", args: [table, ...a] }); return w; },
        gte: (...a: unknown[]) => { calls.push({ method: "gte", args: [table, ...a] }); return w; },
        is: (...a: unknown[]) => { calls.push({ method: "is", args: [table, ...a] }); return w; },
        maybeSingle: async () => ({ data: result.data, error: result.error ?? null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: result.data, error: result.error ?? null, count: result.count }),
      };
      return w;
    }
    const db = {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        if (table === "messages") return wrap(table, { data: null, error: null, count: 42 });
        if (table === "tenants") return wrap(table, { data: { personas_ativas: ["atendimento", "vendas"] }, error: null });
        if (table === "whatsapp_connections") return wrap(table, { data: null, error: null, count: 1 });
        throw new Error(`tabela inesperada: ${table}`);
      },
    };
    const repo = new SupabaseUsageRepository(db as unknown as IrisSupabaseClient);

    const result = await repo.getUsageSnapshot(TENANT_A);

    expect(result).toEqual({ mensagens_mes_atual: 42, personas_ativas_count: 2, numeros_conectados: 1 });
    expect(calls).toContainEqual({ method: "eq", args: ["messages", "tenant_id", TENANT_A] });
    expect(calls).toContainEqual({ method: "gte", args: ["messages", "created_at", startOfCurrentMonthISO()] });
    expect(calls).toContainEqual({ method: "eq", args: ["whatsapp_connections", "tenant_id", TENANT_A] });
    expect(calls).toContainEqual({ method: "eq", args: ["whatsapp_connections", "session_status", "conectado"] });
  });

  it("countFollowUpsThisMonth aplica eq('tenant_id', ...) e gte('created_at', início do mês)", async () => {
    const { chain, calls } = buildChainSpy({ data: null, error: null, count: 3 });
    const db = { from: () => chain };
    const repo = new SupabaseUsageRepository(db as unknown as IrisSupabaseClient);

    const result = await repo.countFollowUpsThisMonth(TENANT_A);

    expect(result).toBe(3);
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_A] });
    expect(calls.some((c) => c.method === "gte" && c.args[0] === "created_at")).toBe(true);
  });

  it("propaga erro do client como UsageQueryError tipado", async () => {
    const { chain } = buildChainSpy({ data: null, error: { message: "timeout" } });
    const db = { from: () => chain };
    const repo = new SupabaseUsageRepository(db as unknown as IrisSupabaseClient);

    await expect(repo.countFollowUpsThisMonth(TENANT_A)).rejects.toBeInstanceOf(UsageQueryError);
  });
});

describe("SupabaseFollowUpRepository — create grava tenant_id (Requisito 3)", () => {
  it("create() inclui tenant_id no insert (nunca confia em RLS sozinho)", async () => {
    const { chain, calls } = buildChainSpy({
      data: { id: "fu-1", conversation_id: "conv-1", agendado_para: "2026-08-22T10:00:00Z", status: "pendente" },
      error: null,
    });
    const db = { from: () => chain };
    const repo = new SupabaseFollowUpRepository(db as unknown as IrisSupabaseClient);

    const result = await repo.create({ tenantId: TENANT_A, conversationId: "conv-1", agendadoPara: "2026-08-22T10:00:00Z" });

    expect(result.id).toBe("fu-1");
    expect(calls).toContainEqual({ method: "insert", args: [{ tenant_id: TENANT_A, conversation_id: "conv-1", agendado_para: "2026-08-22T10:00:00Z" }] });
  });

  it("propaga erro do client como FollowUpQueryError tipado", async () => {
    const { chain } = buildChainSpy({ data: null, error: { message: "constraint violation" } });
    const db = { from: () => chain };
    const repo = new SupabaseFollowUpRepository(db as unknown as IrisSupabaseClient);

    await expect(repo.create({ tenantId: TENANT_A, conversationId: "conv-1", agendadoPara: "2026-08-22T10:00:00Z" })).rejects.toBeInstanceOf(
      FollowUpQueryError,
    );
  });
});
