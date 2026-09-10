// Logos Iris — cost-observability-v1
// Test cases derivados 1:1 dos Critérios de Aceite. Fakes em memória (padrão feature-gating-v1.test.ts).

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelRates, ModelUsageLogRepository } from "@/repositories/model-usage-log.repository";
import type { ModelProvider } from "@/types/model-gateway.types";
import type { UsageLogAggregateRow } from "@/types/cost-observability.types";
import { computeCostUsd } from "@/schemas/cost-observability.schema";
import { ForbiddenAdminError, ModelRatesNotFoundError } from "@/services/cost-observability.errors";
import { CostObservabilityService } from "@/services/cost-observability.service";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER = "00000000-0000-4000-8000-000000000002";
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MODEL_1 = "11111111-1111-4111-8111-111111111111";
const MODEL_2 = "22222222-2222-4222-8222-222222222222";

interface SeededRow extends UsageLogAggregateRow {
  tenant_id: string;
  created_at: string;
}

class FakeRepo implements ModelUsageLogRepository {
  rates = new Map<string, ModelRates>();
  providers = new Map<string, ModelProvider>();
  seeded: SeededRow[] = [];
  readonly inserts: Parameters<ModelUsageLogRepository["insertUsage"]>[0][] = [];
  readonly mirrors: Parameters<ModelUsageLogRepository["mirrorToMessage"]>[0][] = [];

  async getModelRates(modelId: string): Promise<ModelRates | null> {
    return this.rates.get(modelId) ?? null;
  }
  async insertUsage(row: Parameters<ModelUsageLogRepository["insertUsage"]>[0]): Promise<void> {
    this.inserts.push(row);
  }
  async mirrorToMessage(params: Parameters<ModelUsageLogRepository["mirrorToMessage"]>[0]): Promise<void> {
    this.mirrors.push(params);
  }
  async fetchUsageRows(filters: {
    tenant_id?: string;
    model_id?: string;
    from: string;
    to: string;
  }): Promise<UsageLogAggregateRow[]> {
    return this.seeded
      .filter((r) => {
        if (filters.tenant_id && r.tenant_id !== filters.tenant_id) return false;
        if (filters.model_id && r.model_id !== filters.model_id) return false;
        return Date.parse(r.created_at) >= Date.parse(filters.from) && Date.parse(r.created_at) <= Date.parse(filters.to);
      })
      .map((r) => ({
        model_id: r.model_id,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        custo_usd: r.custo_usd,
        latencia_ms: r.latencia_ms,
        escalonou_para_humano: r.escalonou_para_humano,
      }));
  }
  async fetchProviders(modelIds: string[]): Promise<Map<string, ModelProvider>> {
    const out = new Map<string, ModelProvider>();
    for (const id of new Set(modelIds)) {
      const p = this.providers.get(id);
      if (p) out.set(id, p);
    }
    return out;
  }
}

function build() {
  const repo = new FakeRepo();
  const service = new CostObservabilityService(repo);
  return { repo, service };
}

beforeEach(() => {
  process.env.ADMIN_USER_ID = ADMIN_ID;
});

// ── computeCostUsd (Requisito 2) ───────────────────────────────────────────

describe("computeCostUsd — Requisito 2", () => {
  it("custo_por_1k_input=0.001, 2000 tokens input → parcela de input = 0.002", () => {
    expect(computeCostUsd({ tokens_input: 2000, tokens_output: 0, custo_por_1k_tokens_input: 0.001, custo_por_1k_tokens_output: 0 })).toBe(0.002);
  });
  it("soma input + output", () => {
    expect(
      computeCostUsd({ tokens_input: 1000, tokens_output: 500, custo_por_1k_tokens_input: 0.002, custo_por_1k_tokens_output: 0.004 }),
    ).toBe(0.002 + 0.002);
  });
});

// ── logModelUsage (Requisito 1/2/3/5) ──────────────────────────────────────

describe("CostObservabilityService.logModelUsage", () => {
  const baseInput = () => ({
    tenant_id: TENANT_A,
    conversation_id: randomUUID(),
    model_id: MODEL_1,
    message_id: randomUUID(),
    tokens_input: 2000,
    tokens_output: 1000,
    latencia_ms: 850,
    escalonou_para_humano: false,
  });

  it("AC1: grava model_usage_log com tokens/custo/latencia + espelha os mesmos campos na messages", async () => {
    const { repo, service } = build();
    repo.rates.set(MODEL_1, { custo_por_1k_tokens_input: 0.001, custo_por_1k_tokens_output: 0.002 });
    const input = baseInput();

    const { custo_usd } = await service.logModelUsage(input);

    expect(custo_usd).toBe(2 * 0.001 + 1 * 0.002); // 0.004
    expect(repo.inserts).toHaveLength(1);
    expect(repo.inserts[0]).toMatchObject({
      tenant_id: TENANT_A,
      model_id: MODEL_1,
      tokens_input: 2000,
      tokens_output: 1000,
      custo_usd: 0.004,
      latencia_ms: 850,
      escalonou_para_humano: false,
    });
    expect(repo.mirrors).toHaveLength(1);
    expect(repo.mirrors[0]).toMatchObject({
      message_id: input.message_id,
      tenant_id: TENANT_A,
      model_id: MODEL_1,
      tokens_input: 2000,
      tokens_output: 1000,
      custo_usd: 0.004,
      latencia_ms: 850,
    });
  });

  it("AC2: custo_usd persistido é o calculado no momento da chamada, não recalculado do preço atual", async () => {
    const { repo, service } = build();
    repo.rates.set(MODEL_1, { custo_por_1k_tokens_input: 0.001, custo_por_1k_tokens_output: 0 });

    await service.logModelUsage({ ...baseInput(), tokens_output: 0 });
    const gravado = repo.inserts[0].custo_usd;

    // preço do modelo muda depois — o registro já persistido não muda
    repo.rates.set(MODEL_1, { custo_por_1k_tokens_input: 999, custo_por_1k_tokens_output: 999 });
    expect(repo.inserts[0].custo_usd).toBe(gravado);
    expect(gravado).toBe(0.002);
  });

  it("AC3: escalonou_para_humano=true quando a chamada resultou em pausa por baixa_confianca", async () => {
    const { repo, service } = build();
    repo.rates.set(MODEL_1, { custo_por_1k_tokens_input: 0.001, custo_por_1k_tokens_output: 0.001 });

    await service.logModelUsage({ ...baseInput(), escalonou_para_humano: true });

    expect(repo.inserts[0].escalonou_para_humano).toBe(true);
  });

  it("model_id sem tarifa no registry → ModelRatesNotFoundError, nada é gravado", async () => {
    const { repo, service } = build();
    await expect(service.logModelUsage(baseInput())).rejects.toBeInstanceOf(ModelRatesNotFoundError);
    expect(repo.inserts).toHaveLength(0);
    expect(repo.mirrors).toHaveLength(0);
  });

  it("rejeita tokens negativos e ids não-uuid (Zod na fronteira)", async () => {
    const { service } = build();
    await expect(service.logModelUsage({ ...baseInput(), tokens_input: -1 })).rejects.toThrow();
    await expect(service.logModelUsage({ ...baseInput(), model_id: "nope" })).rejects.toThrow();
  });
});

// ── getCostBreakdown (Requisito 4/5/6) ─────────────────────────────────────

describe("CostObservabilityService.getCostBreakdown", () => {
  const PERIODO = { from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T23:59:59.000Z" };

  function seedTypical(repo: FakeRepo) {
    repo.providers.set(MODEL_1, "glm");
    repo.providers.set(MODEL_2, "claude");
    repo.seeded = [
      { tenant_id: TENANT_A, model_id: MODEL_1, tokens_input: 1000, tokens_output: 500, custo_usd: 0.01, latencia_ms: 800, escalonou_para_humano: false, created_at: "2026-09-05T10:00:00.000Z" },
      { tenant_id: TENANT_A, model_id: MODEL_1, tokens_input: 2000, tokens_output: 1000, custo_usd: 0.02, latencia_ms: 1200, escalonou_para_humano: true, created_at: "2026-09-06T10:00:00.000Z" },
      { tenant_id: TENANT_B, model_id: MODEL_2, tokens_input: 500, tokens_output: 200, custo_usd: 0.05, latencia_ms: 400, escalonou_para_humano: false, created_at: "2026-09-07T10:00:00.000Z" },
    ];
  }

  it("AC4: agrega totais, latencia_media, taxa_escalonamento e quebra_por_modelo", async () => {
    const { repo, service } = build();
    seedTypical(repo);

    const result = await service.getCostBreakdown(ADMIN_ID, PERIODO);

    expect(result.total_custo_usd).toBeCloseTo(0.08, 6);
    expect(result.total_tokens_input).toBe(3500);
    expect(result.total_tokens_output).toBe(1700);
    expect(result.latencia_media_ms).toBe(Math.round((800 + 1200 + 400) / 3));
    expect(result.taxa_escalonamento).toBeCloseTo(1 / 3, 4);
    expect(result.quebra_por_modelo).toHaveLength(2);
    const m1 = result.quebra_por_modelo.find((q) => q.model_id === MODEL_1);
    expect(m1).toMatchObject({ provider: "glm", custo_usd: 0.03, taxa_escalonamento: 0.5 });
    const m2 = result.quebra_por_modelo.find((q) => q.model_id === MODEL_2);
    expect(m2).toMatchObject({ provider: "claude", custo_usd: 0.05, taxa_escalonamento: 0 });
  });

  it("AC5: filtro por tenant_id restringe a agregação àquele tenant", async () => {
    const { repo, service } = build();
    seedTypical(repo);

    const result = await service.getCostBreakdown(ADMIN_ID, { ...PERIODO, tenant_id: TENANT_A });

    expect(result.total_custo_usd).toBeCloseTo(0.03, 6);
    expect(result.quebra_por_modelo).toEqual([
      { model_id: MODEL_1, provider: "glm", custo_usd: 0.03, taxa_escalonamento: 0.5 },
    ]);
  });

  it("período sem registros → tudo zero, quebra vazia (nunca lança)", async () => {
    const { repo, service } = build();
    seedTypical(repo);

    const result = await service.getCostBreakdown(ADMIN_ID, { from: "2020-01-01T00:00:00.000Z", to: "2020-02-01T00:00:00.000Z" });

    expect(result).toEqual({
      total_custo_usd: 0,
      total_tokens_input: 0,
      total_tokens_output: 0,
      latencia_media_ms: 0,
      taxa_escalonamento: 0,
      quebra_por_modelo: [],
    });
  });

  it("AC6 / RLS-Auth: caller que não é o admin hardcoded → ForbiddenAdminError", async () => {
    const { service } = build();
    await expect(service.getCostBreakdown(OTHER_USER, PERIODO)).rejects.toBeInstanceOf(ForbiddenAdminError);
  });

  it("sem ADMIN_USER_ID configurado, ninguém passa (fail-closed)", async () => {
    delete process.env.ADMIN_USER_ID;
    const { service } = build();
    await expect(service.getCostBreakdown(ADMIN_ID, PERIODO)).rejects.toBeInstanceOf(ForbiddenAdminError);
  });

  it("rejeita from > to e datetime inválido", async () => {
    const { service } = build();
    await expect(
      service.getCostBreakdown(ADMIN_ID, { from: "2026-09-30T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" }),
    ).rejects.toThrow();
    await expect(service.getCostBreakdown(ADMIN_ID, { from: "ontem", to: "hoje" })).rejects.toThrow();
  });
});

// ── console limpo (critério de aceite) ─────────────────────────────────────

describe("cost-observability — sem erro em console", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("log + breakdown no fluxo normal nunca chamam console.error/warn", async () => {
    const { repo, service } = build();
    repo.rates.set(MODEL_1, { custo_por_1k_tokens_input: 0.001, custo_por_1k_tokens_output: 0.001 });
    repo.providers.set(MODEL_1, "glm");
    repo.seeded = [
      { tenant_id: TENANT_A, model_id: MODEL_1, tokens_input: 10, tokens_output: 5, custo_usd: 0.001, latencia_ms: 100, escalonou_para_humano: false, created_at: "2026-09-05T10:00:00.000Z" },
    ];

    await service.logModelUsage({
      tenant_id: TENANT_A,
      conversation_id: randomUUID(),
      model_id: MODEL_1,
      message_id: randomUUID(),
      tokens_input: 10,
      tokens_output: 5,
      latencia_ms: 100,
      escalonou_para_humano: false,
    });
    await service.getCostBreakdown(ADMIN_ID, { from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z" });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
