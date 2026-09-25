import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { AppointmentService } from "@/services/appointment.service";
import type { AppointmentRepository } from "@/repositories/appointment.repository";
import { PastHorarioError, CrossTenantReferenceError, AppointmentNotFoundError } from "@/services/appointment.errors";
import type { AppointmentDTO } from "@/types/appointment.types";

// UUIDs RFC-4122-válidos (versão 4, variante 8) — Zod .uuid() (diferente do formato usado em
// seed.sql/pgTAP, que não passa pela validação Zod) exige o nibble de versão/variante corretos,
// mesmo padrão de src/tests/contact-memory.test.ts.
const TENANT_A = "00000000-0000-4000-8000-00000000a001";
const CONTACT_A = "00000000-0000-4000-8000-0000000c0001";
const CONVERSATION_A = "00000000-0000-4000-8000-0000000d0001";
const APPOINTMENT_ID = "00000000-0000-4000-8000-000000000f01";

function baseDTO(overrides: Partial<AppointmentDTO> = {}): AppointmentDTO {
  return {
    id: APPOINTMENT_ID,
    contact_id: CONTACT_A,
    conversation_id: CONVERSATION_A,
    horario: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "agendado",
    confirmacao_enviada_em: null,
    ...overrides,
  };
}

class FakeAppointmentRepo implements AppointmentRepository {
  createCalls: unknown[] = [];
  updateCalls: unknown[] = [];
  contactBelongs = true;
  conversationBelongs = true;
  updateResult: AppointmentDTO | null = baseDTO();

  async contactBelongsToTenant(): Promise<boolean> {
    return this.contactBelongs;
  }
  async conversationBelongsToTenant(): Promise<boolean> {
    return this.conversationBelongs;
  }
  async create(params: unknown): Promise<AppointmentDTO> {
    this.createCalls.push(params);
    return baseDTO();
  }
  async listByTenant(): Promise<AppointmentDTO[]> {
    return [baseDTO()];
  }
  async updateStatus(params: unknown): Promise<AppointmentDTO | null> {
    this.updateCalls.push(params);
    return this.updateResult;
  }
}

describe("AppointmentService.createAppointment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("Requisito 1/6: horario futuro válido cria o appointment (status default 'agendado' vem do Repository)", async () => {
    const repo = new FakeAppointmentRepo();
    const service = new AppointmentService(repo);

    const result = await service.createAppointment({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A,
      conversation_id: CONVERSATION_A,
      horario: "2026-09-26T14:00:00Z",
    });

    expect(result.status).toBe("agendado");
    expect(repo.createCalls).toHaveLength(1);
  });

  it("Requisito 6: horario no passado é rejeitado ANTES de chamar o Repository (nenhuma linha criada)", async () => {
    const repo = new FakeAppointmentRepo();
    const service = new AppointmentService(repo);

    await expect(
      service.createAppointment({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A,
        conversation_id: CONVERSATION_A,
        horario: "2026-09-24T14:00:00Z", // ontem, relativo ao fake time
      })
    ).rejects.toBeInstanceOf(PastHorarioError);
    expect(repo.createCalls).toHaveLength(0);
  });

  it("Requisito 7: contact_id de outro tenant é rejeitado (checagem cruzada, nunca confia só na FK)", async () => {
    const repo = new FakeAppointmentRepo();
    repo.contactBelongs = false;
    const service = new AppointmentService(repo);

    await expect(
      service.createAppointment({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A,
        conversation_id: CONVERSATION_A,
        horario: "2026-09-26T14:00:00Z",
      })
    ).rejects.toBeInstanceOf(CrossTenantReferenceError);
    expect(repo.createCalls).toHaveLength(0);
  });

  it("Requisito 7: conversation_id de outro tenant é rejeitado", async () => {
    const repo = new FakeAppointmentRepo();
    repo.conversationBelongs = false;
    const service = new AppointmentService(repo);

    await expect(
      service.createAppointment({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A,
        conversation_id: CONVERSATION_A,
        horario: "2026-09-26T14:00:00Z",
      })
    ).rejects.toBeInstanceOf(CrossTenantReferenceError);
  });

  it("Zod: horario que não é uma data ISO válida é rejeitado antes de qualquer checagem de negócio", async () => {
    const repo = new FakeAppointmentRepo();
    const service = new AppointmentService(repo);

    await expect(
      service.createAppointment({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A,
        conversation_id: CONVERSATION_A,
        horario: "não-é-uma-data",
      })
    ).rejects.toThrow();
    expect(repo.createCalls).toHaveLength(0);
  });
});

describe("AppointmentService.listAppointments", () => {
  it("Requisito 4: aplica defaults de paginação (limit=20, offset=0) quando não informados", async () => {
    const repo = new FakeAppointmentRepo();
    const spy = vi.spyOn(repo, "listByTenant");
    const service = new AppointmentService(repo);

    await service.listAppointments({
      tenant_id: TENANT_A,
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-30T23:59:59Z",
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, limit: 20, offset: 0 })
    );
  });
});

describe("AppointmentService.updateAppointmentStatus", () => {
  it("Requisito 3: remarcação exige novo_horario (Zod rejeita status='remarcado' sem ele)", async () => {
    const repo = new FakeAppointmentRepo();
    const service = new AppointmentService(repo);

    await expect(
      service.updateAppointmentStatus({
        tenant_id: TENANT_A,
        appointment_id: APPOINTMENT_ID,
        status: "remarcado",
      })
    ).rejects.toThrow();
    expect(repo.updateCalls).toHaveLength(0);
  });

  it("appointment inexistente (ou de outro tenant): Repository devolve null, Service lança AppointmentNotFoundError", async () => {
    const repo = new FakeAppointmentRepo();
    repo.updateResult = null;
    const service = new AppointmentService(repo);

    await expect(
      service.updateAppointmentStatus({
        tenant_id: TENANT_A,
        appointment_id: APPOINTMENT_ID,
        status: "confirmado",
      })
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  it("remarcação em 1 toque: novo_horario válido passa pro Repository", async () => {
    const repo = new FakeAppointmentRepo();
    const service = new AppointmentService(repo);

    await service.updateAppointmentStatus({
      tenant_id: TENANT_A,
      appointment_id: APPOINTMENT_ID,
      status: "remarcado",
      novo_horario: "2026-09-27T15:00:00Z",
    });

    expect(repo.updateCalls[0]).toMatchObject({ status: "remarcado", novoHorario: "2026-09-27T15:00:00Z" });
  });
});
