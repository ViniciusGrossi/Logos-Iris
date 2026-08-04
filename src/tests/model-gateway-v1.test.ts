// Logos Iris — model-gateway-v1
// Test cases derivados 1:1 dos Critérios de Aceite em docs/specs/model-gateway-v1.md.
// Repository é fake (fixture em memória) — RouteModel não chama nenhum provider real (spec, seção Validação).

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import type { ModelRegistryRepository } from "@/repositories/model-registry.repository";
import type { ModelRegistryPatch } from "@/schemas/model-registry.schema";
import { ForbiddenAdminError, ModelRegistryEntryNotFoundError, NoActiveModelError } from "@/services/model-gateway.errors";
import { ModelGatewayService } from "@/services/model-gateway.service";
import type { ModelRegistryEntryDTO, ModelTaskType, PlanTier } from "@/types/model-gateway.types";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const TENANT_ID = "00000000-0000-4000-8000-000000000003";

function makeRow(overrides: Partial<ModelRegistryEntryDTO> = {}): ModelRegistryEntryDTO {
  return {
    id: randomUUID(),
    provider: "claude",
    model_name: "claude-default",
    task_type: "conversa_principal",
    tier: "premium",
    prioridade_fallback: 1,
    ativo: true,
    custo_por_1k_tokens_input: 0.003,
    custo_por_1k_tokens_output: 0.015,
    ...overrides,
  };
}

class FakeModelRegistryRepository implements ModelRegistryRepository {
  constructor(private rows: ModelRegistryEntryDTO[]) {}

  async findActiveOrderedByTaskAndTier(taskType: ModelTaskType, tier: PlanTier): Promise<ModelRegistryEntryDTO[]> {
    return this.rows
      .filter((r) => r.task_type === taskType && r.tier === tier && r.ativo)
      .sort((a, b) => a.prioridade_fallback - b.prioridade_fallback);
  }

  async findAll(): Promise<ModelRegistryEntryDTO[]> {
    return [...this.rows];
  }

  async update(id: string, patch: ModelRegistryPatch): Promise<ModelRegistryEntryDTO> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new ModelRegistryEntryNotFoundError(id);
    Object.assign(row, patch);
    return row;
  }
}

beforeEach(() => {
  process.env.ADMIN_USER_ID = ADMIN_ID;
});

describe("ModelGatewayService.routeModel", () => {
  it("Given 2 linhas ativas (prioridade 1 e 2) — retorna a de prioridade_fallback=1, fallback_chain_position=1", async () => {
    const p1 = makeRow({ prioridade_fallback: 1, provider: "claude" });
    const p2 = makeRow({ prioridade_fallback: 2, provider: "gpt4o" });
    const service = new ModelGatewayService(new FakeModelRegistryRepository([p1, p2]));

    const result = await service.routeModel({ tenant_id: TENANT_ID, task_type: "conversa_principal", tier_do_plano: "premium" });

    expect(result.model_id).toBe(p1.id);
    expect(result.fallback_chain_position).toBe(1);
  });

  it("Given a linha de prioridade 1 inativa — retorna a de prioridade_fallback=2 (próxima ativa)", async () => {
    const p1 = makeRow({ prioridade_fallback: 1, provider: "claude", ativo: false });
    const p2 = makeRow({ prioridade_fallback: 2, provider: "gpt4o" });
    const service = new ModelGatewayService(new FakeModelRegistryRepository([p1, p2]));

    const result = await service.routeModel({ tenant_id: TENANT_ID, task_type: "conversa_principal", tier_do_plano: "premium" });

    expect(result.model_id).toBe(p2.id);
    expect(result.fallback_chain_position).toBe(2);
  });

  it("Given nenhuma linha ativa para (task_type, tier) — lança NoActiveModelError (nunca model_id nulo)", async () => {
    const service = new ModelGatewayService(new FakeModelRegistryRepository([]));

    await expect(
      service.routeModel({ tenant_id: TENANT_ID, task_type: "extracao_documento", tier_do_plano: "basico" }),
    ).rejects.toBeInstanceOf(NoActiveModelError);
  });

  it.each(["glm", "kimi", "deepseek", "minimax"] as const)(
    "Given provedor chinês (%s) cadastrado por engano com tier=premium — é ignorado, invariante ADR-025 nunca quebra",
    async (provider) => {
      const badRow = makeRow({ prioridade_fallback: 1, provider, tier: "premium" });
      const fallback = makeRow({ prioridade_fallback: 2, provider: "claude", tier: "premium" });
      const service = new ModelGatewayService(new FakeModelRegistryRepository([badRow, fallback]));

      const result = await service.routeModel({ tenant_id: TENANT_ID, task_type: "conversa_principal", tier_do_plano: "premium" });

      expect(result.provider).toBe("claude");
    },
  );

  it("Given provedor chinês é a única linha ativa em tier=premium — nenhum candidato sobrevive, lança NoActiveModelError", async () => {
    const onlyBad = makeRow({ prioridade_fallback: 1, provider: "glm", tier: "premium" });
    const service = new ModelGatewayService(new FakeModelRegistryRepository([onlyBad]));

    await expect(
      service.routeModel({ tenant_id: TENANT_ID, task_type: "conversa_principal", tier_do_plano: "premium" }),
    ).rejects.toBeInstanceOf(NoActiveModelError);
  });

  it("Given task_type=triagem (básico e premium) — usa o mesmo algoritmo genérico de seleção", async () => {
    const basico = makeRow({ task_type: "triagem", tier: "basico", provider: "groq", prioridade_fallback: 1 });
    const premium = makeRow({ task_type: "triagem", tier: "premium", provider: "claude", prioridade_fallback: 1 });
    const service = new ModelGatewayService(new FakeModelRegistryRepository([basico, premium]));

    const resultBasico = await service.routeModel({ tenant_id: TENANT_ID, task_type: "triagem", tier_do_plano: "basico" });
    const resultPremium = await service.routeModel({ tenant_id: TENANT_ID, task_type: "triagem", tier_do_plano: "premium" });

    expect(resultBasico.provider).toBe("groq");
    expect(resultPremium.provider).toBe("claude");
  });

  it("rejeita tenant_id que não é UUID (validação Zod na fronteira do Service)", async () => {
    const service = new ModelGatewayService(new FakeModelRegistryRepository([]));

    await expect(
      service.routeModel({ tenant_id: "not-a-uuid", task_type: "triagem", tier_do_plano: "basico" }),
    ).rejects.toThrow();
  });
});

describe("ModelGatewayService — admin gate (equivalente a RLS: tenant comum não acessa dado admin-only)", () => {
  it("listModelRegistry: usuário não-admin recebe ForbiddenAdminError (403 no Controller)", async () => {
    const service = new ModelGatewayService(new FakeModelRegistryRepository([makeRow()]));

    await expect(service.listModelRegistry(OTHER_USER_ID)).rejects.toBeInstanceOf(ForbiddenAdminError);
  });

  it("listModelRegistry: admin autenticado recebe a lista completa", async () => {
    const rows = [makeRow(), makeRow({ task_type: "triagem" })];
    const service = new ModelGatewayService(new FakeModelRegistryRepository(rows));

    const result = await service.listModelRegistry(ADMIN_ID);

    expect(result).toHaveLength(2);
  });

  it("updateModelRegistryEntry: usuário não-admin recebe ForbiddenAdminError e a linha não muda", async () => {
    const row = makeRow({ ativo: true });
    const service = new ModelGatewayService(new FakeModelRegistryRepository([row]));

    await expect(
      service.updateModelRegistryEntry(OTHER_USER_ID, { id: row.id, patch: { ativo: false } }),
    ).rejects.toBeInstanceOf(ForbiddenAdminError);
    expect(row.ativo).toBe(true);
  });

  it('Given admin autenticado, When PUT com { ativo: false }, Then RouteModel já reflete na próxima chamada, sem cache stale', async () => {
    const p1 = makeRow({ prioridade_fallback: 1, provider: "claude" });
    const p2 = makeRow({ prioridade_fallback: 2, provider: "gpt4o" });
    const service = new ModelGatewayService(new FakeModelRegistryRepository([p1, p2]));

    await service.updateModelRegistryEntry(ADMIN_ID, { id: p1.id, patch: { ativo: false } });
    const result = await service.routeModel({ tenant_id: TENANT_ID, task_type: "conversa_principal", tier_do_plano: "premium" });

    expect(result.model_id).toBe(p2.id);
  });

  it("updateModelRegistryEntry: rejeita patch vazio", async () => {
    const row = makeRow();
    const service = new ModelGatewayService(new FakeModelRegistryRepository([row]));

    await expect(service.updateModelRegistryEntry(ADMIN_ID, { id: row.id, patch: {} })).rejects.toThrow();
  });

  it("updateModelRegistryEntry: id inexistente lança ModelRegistryEntryNotFoundError", async () => {
    const service = new ModelGatewayService(new FakeModelRegistryRepository([]));

    await expect(
      service.updateModelRegistryEntry(ADMIN_ID, { id: randomUUID(), patch: { ativo: false } }),
    ).rejects.toBeInstanceOf(ModelRegistryEntryNotFoundError);
  });
});
