import { describe, it, expect } from "vitest";

import { SupabaseAppointmentRepository } from "@/repositories/appointment.repository";
import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

// Regressão: updateStatus e as checagens cruzadas (Requisito 7) precisam SEMPRE incluir o filtro
// tenant_id na query — nunca confiar em id/contact_id/conversation_id isolados. Mesmo padrão de
// tenant-lookup.repository.test.ts (spy da chain do client, trava a REGRESSÃO se o filtro sumir).

const TENANT_A = "00000000-0000-0000-0000-0000000000a1";
const APPOINTMENT_ID = "00000000-0000-0000-0000-000000000f01";

type ChainCall = { method: string; args: unknown[] };

function buildSelectSpy(result: { data: unknown; error: null }) {
  const calls: ChainCall[] = [];
  const chain = {
    from(...args: unknown[]) {
      calls.push({ method: "from", args });
      return chain;
    },
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return chain;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return chain;
    },
    is(...args: unknown[]) {
      calls.push({ method: "is", args });
      return chain;
    },
    maybeSingle: async () => result,
  };
  return { db: chain as unknown as IrisSupabaseClient, calls };
}

function buildUpdateSpy(result: { data: unknown; error: null }) {
  const calls: ChainCall[] = [];
  const chain = {
    from(...args: unknown[]) {
      calls.push({ method: "from", args });
      return chain;
    },
    update(...args: unknown[]) {
      calls.push({ method: "update", args });
      return chain;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return chain;
    },
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return chain;
    },
    maybeSingle: async () => result,
  };
  return { db: chain as unknown as IrisSupabaseClient, calls };
}

describe("SupabaseAppointmentRepository — checagens cruzadas de tenant (Requisito 7)", () => {
  it("contactBelongsToTenant filtra id + tenant_id + deleted_at is null", async () => {
    const { db, calls } = buildSelectSpy({ data: { id: "c1" }, error: null });
    const repo = new SupabaseAppointmentRepository(db);

    const result = await repo.contactBelongsToTenant(TENANT_A, "c1");

    expect(result).toBe(true);
    expect(calls).toContainEqual({ method: "from", args: ["contacts"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", "c1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_A] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
  });

  it("conversationBelongsToTenant filtra id + tenant_id", async () => {
    const { db, calls } = buildSelectSpy({ data: { id: "conv1" }, error: null });
    const repo = new SupabaseAppointmentRepository(db);

    const result = await repo.conversationBelongsToTenant(TENANT_A, "conv1");

    expect(result).toBe(true);
    expect(calls).toContainEqual({ method: "from", args: ["conversations"] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", "conv1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_A] });
  });
});

describe("SupabaseAppointmentRepository.updateStatus — regressão de tenant-scoping", () => {
  it("update SEMPRE filtra por id E tenant_id (nunca id isolado)", async () => {
    const row = {
      id: APPOINTMENT_ID,
      contact_id: "c1",
      conversation_id: "conv1",
      horario: "2026-09-26T14:00:00Z",
      status: "confirmado",
      confirmacao_enviada_em: null,
    };
    const { db, calls } = buildUpdateSpy({ data: row, error: null });
    const repo = new SupabaseAppointmentRepository(db);

    const result = await repo.updateStatus({
      tenantId: TENANT_A,
      appointmentId: APPOINTMENT_ID,
      status: "confirmado",
    });

    expect(result?.status).toBe("confirmado");
    expect(calls).toContainEqual({ method: "eq", args: ["id", APPOINTMENT_ID] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_A] });
  });

  it("id existe mas pertence a OUTRO tenant: update não afeta nenhuma linha (RLS/filtro), Repository devolve null", async () => {
    const { db } = buildUpdateSpy({ data: null, error: null });
    const repo = new SupabaseAppointmentRepository(db);

    const result = await repo.updateStatus({
      tenantId: TENANT_A,
      appointmentId: APPOINTMENT_ID,
      status: "confirmado",
    });

    expect(result).toBeNull();
  });

  it("remarcação (novo_horario presente) inclui horario no patch de update", async () => {
    const row = {
      id: APPOINTMENT_ID,
      contact_id: "c1",
      conversation_id: "conv1",
      horario: "2026-09-27T15:00:00Z",
      status: "remarcado",
      confirmacao_enviada_em: null,
    };
    const { db, calls } = buildUpdateSpy({ data: row, error: null });
    const repo = new SupabaseAppointmentRepository(db);

    await repo.updateStatus({
      tenantId: TENANT_A,
      appointmentId: APPOINTMENT_ID,
      status: "remarcado",
      novoHorario: "2026-09-27T15:00:00Z",
    });

    expect(calls).toContainEqual({
      method: "update",
      args: [{ status: "remarcado", horario: "2026-09-27T15:00:00Z" }],
    });
  });
});
