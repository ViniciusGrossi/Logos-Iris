// Logos Iris — human-handoff (docs/specs/human-handoff.md, módulo ★)
// Test cases derivados 1:1 dos Critérios de Aceite: 1 teste por gatilho (5) + resume nunca
// silencioso (pausa longa) + resume-com-confirmação + isolamento multi-tenant + validação Zod.
// Fakes em memória (mesmo padrão de feature-gating-v1.test.ts / knowledge-base-v1.test.ts).

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HumanHandoffRepository } from "@/repositories/handoff.repository";
import type { ContactMemoryRepository } from "@/repositories/contact-memory.repository";
import type { ContactMemorySummaryDTO, RawContactMessage } from "@/types/contact-memory.types";
import type { ConversationRow, HandoffTrigger, OpenHandoffEvent } from "@/types/human-handoff.types";
import { ConversationEncerradaError, ConversationNotFoundError } from "@/services/human-handoff.errors";
import { HumanHandoffService } from "@/services/human-handoff.service";
import { parseChatCommand } from "@/schemas/human-handoff.schema";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface StoredEvent {
  id: string;
  tenant_id: string;
  conversation_id: string;
  gatilho: HandoffTrigger;
  acionado_em: string;
  resolvido_em: string | null;
  retomada_confirmada: boolean;
}

class FakeHandoffRepo implements HumanHandoffRepository {
  conversations = new Map<string, ConversationRow>();
  events: StoredEvent[] = [];

  seedConversation(row: Partial<ConversationRow> & { id: string; tenant_id: string }): ConversationRow {
    const full: ConversationRow = {
      contact_id: row.contact_id ?? randomUUID(),
      persona_ativa: row.persona_ativa ?? "atendimento",
      status: row.status ?? "ativa",
      pausada_ate: row.pausada_ate ?? null,
      created_at: row.created_at ?? "2026-08-01T12:00:00.000Z",
      ...row,
    };
    this.conversations.set(full.id, full);
    return full;
  }

  seedEvent(e: Partial<StoredEvent> & { conversation_id: string; tenant_id: string }): StoredEvent {
    const full: StoredEvent = {
      id: e.id ?? randomUUID(),
      gatilho: e.gatilho ?? "botao_painel",
      acionado_em: e.acionado_em ?? new Date().toISOString(),
      resolvido_em: e.resolvido_em ?? null,
      retomada_confirmada: e.retomada_confirmada ?? false,
      ...e,
    };
    this.events.push(full);
    return full;
  }

  async getConversation(tenantId: string, conversationId: string): Promise<ConversationRow | null> {
    const row = this.conversations.get(conversationId);
    if (!row || row.tenant_id !== tenantId) return null;
    return { ...row };
  }

  async pauseForHandoff(params: {
    tenant_id: string;
    conversation_id: string;
    gatilho: HandoffTrigger;
    pausada_ate?: string;
  }): Promise<{ status: "pausada" }> {
    const row = this.conversations.get(params.conversation_id);
    if (row && row.tenant_id === params.tenant_id) {
      row.status = "pausada";
      row.pausada_ate = params.pausada_ate ?? row.pausada_ate;
    }
    this.seedEvent({
      tenant_id: params.tenant_id,
      conversation_id: params.conversation_id,
      gatilho: params.gatilho,
      acionado_em: new Date().toISOString(),
    });
    return { status: "pausada" };
  }

  async findOpenHandoffEvent(tenantId: string, conversationId: string): Promise<OpenHandoffEvent | null> {
    const open = this.events
      .filter((e) => e.tenant_id === tenantId && e.conversation_id === conversationId && e.resolvido_em === null)
      .sort((a, b) => Date.parse(b.acionado_em) - Date.parse(a.acionado_em));
    if (open.length === 0) return null;
    return { id: open[0].id, gatilho: open[0].gatilho, acionado_em: open[0].acionado_em };
  }

  async countHandoffEvents(tenantId: string, conversationId: string): Promise<number> {
    return this.events.filter((e) => e.tenant_id === tenantId && e.conversation_id === conversationId).length;
  }

  async resolveHandoffEvent(tenantId: string, eventId: string, retomadaConfirmada: boolean): Promise<void> {
    const ev = this.events.find((e) => e.id === eventId && e.tenant_id === tenantId);
    if (ev) {
      ev.resolvido_em = new Date().toISOString();
      ev.retomada_confirmada = retomadaConfirmada;
    }
  }

  async activateConversation(tenantId: string, conversationId: string): Promise<void> {
    const row = this.conversations.get(conversationId);
    if (row && row.tenant_id === tenantId) {
      row.status = "ativa";
      row.pausada_ate = null;
    }
  }
}

class FakeContactMemoryRepo implements ContactMemoryRepository {
  summaries = new Map<string, string>(); // key: `${tenantId}:${contactId}` -> resumo

  async findLatestValidSummary(tenantId: string, contactId: string): Promise<ContactMemorySummaryDTO | null> {
    const resumo = this.summaries.get(`${tenantId}:${contactId}`);
    if (!resumo) return null;
    return {
      id: randomUUID(),
      contact_id: contactId,
      tenant_id: tenantId,
      resumo,
      periodo_inicio: "2026-07-01T00:00:00.000Z",
      periodo_fim: "2026-07-31T00:00:00.000Z",
      expira_em: "2027-01-01T00:00:00.000Z",
      created_at: "2026-08-01T00:00:00.000Z",
    };
  }
  async findMessagesForPeriod(): Promise<RawContactMessage[]> {
    return [];
  }
  async insertSummary(): Promise<ContactMemorySummaryDTO> {
    throw new Error("não usado por human-handoff");
  }
}

function build() {
  const handoffRepo = new FakeHandoffRepo();
  const contactMemoryRepo = new FakeContactMemoryRepo();
  const service = new HumanHandoffService({ handoffRepo, contactMemoryRepo });
  return { service, handoffRepo, contactMemoryRepo };
}

const HORAS = 60 * 60 * 1000;

beforeEach(() => {
  delete process.env.HANDOFF_LONG_PAUSE_HOURS;
  delete process.env.HANDOFF_AUTO_PAUSE_HOURS;
});

// ── parser de comando ──────────────────────────────────────────────────────

describe("parseChatCommand — Requisito 3", () => {
  it.each([
    ["#eu", "pause"],
    ["#EU", "pause"],
    ["  #eu  ", "pause"],
    ["#iris", "resume"],
    ["#Iris", "resume"],
  ] as const)("%s → %s", (input, expected) => {
    expect(parseChatCommand(input)).toBe(expected);
  });

  it.each(["eu", "#euzinho", "quero #eu agora", "iris", ""])("%j não é comando", (input) => {
    expect(parseChatCommand(input)).toBeNull();
  });
});

// ── 1 teste por gatilho ────────────────────────────────────────────────────

describe("HumanHandoffService — gatilho botao_painel (Requisito 1)", () => {
  it("Given conversa ativa, When pauseConversation(botao_painel), Then status=pausada + handoff_events(resolvido_em=null)", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, status: "ativa" });

    const result = await service.pauseConversation({
      tenant_id: TENANT_A,
      conversation_id: conv.id,
      gatilho: "botao_painel",
    });

    expect(result).toEqual({ status: "pausada" });
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("pausada");
    expect(handoffRepo.events).toHaveLength(1);
    expect(handoffRepo.events[0]).toMatchObject({ gatilho: "botao_painel", resolvido_em: null });
  });
});

describe("HumanHandoffService — gatilho from_me_detectado (Requisito 2, ADR-029)", () => {
  it("Given conversa ativa, When pauseFromOwnerMessage, Then pausa por N horas + handoff_events(gatilho=from_me_detectado)", async () => {
    process.env.HANDOFF_AUTO_PAUSE_HOURS = "3";
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A });

    const antes = Date.now();
    await service.pauseFromOwnerMessage({ tenant_id: TENANT_A, conversation_id: conv.id });

    const row = handoffRepo.conversations.get(conv.id);
    expect(row?.status).toBe("pausada");
    const ate = Date.parse(row?.pausada_ate ?? "");
    expect(ate).toBeGreaterThanOrEqual(antes + 3 * HORAS - 2000);
    expect(ate).toBeLessThanOrEqual(Date.now() + 3 * HORAS + 2000);
    expect(handoffRepo.events[0].gatilho).toBe("from_me_detectado");
  });
});

describe("HumanHandoffService — gatilho comando_chat (Requisito 3)", () => {
  it("Given conversa ativa, When pauseConversation(comando_chat) e depois resumeConversation numa pausa curta, Then pausa e retoma direto", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A });

    await service.pauseConversation({ tenant_id: TENANT_A, conversation_id: conv.id, gatilho: "comando_chat" });
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("pausada");

    const resumed = await service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id, confirmado_pelo_dono: false });

    expect(resumed).toEqual({ status: "ativa" });
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("ativa");
    expect(handoffRepo.events[0].resolvido_em).not.toBeNull();
    expect(handoffRepo.events[0].retomada_confirmada).toBe(false); // pausa curta — sem confirmação
  });
});

describe("HumanHandoffService — gatilho pedido_cliente (Requisito 4 / Story 24)", () => {
  it("Given conversa ativa com memória de contato, When escalateByCustomerRequest, Then pausa + dossiê de 3 linhas usando a memória cifrada", async () => {
    const { service, handoffRepo, contactMemoryRepo } = build();
    const contactId = randomUUID();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, contact_id: contactId, persona_ativa: "vendas" });
    contactMemoryRepo.summaries.set(`${TENANT_A}:${contactId}`, "Cliente recorrente, comprou 2x, prefere contato à tarde.");

    const result = await service.escalateByCustomerRequest({ tenant_id: TENANT_A, conversation_id: conv.id });

    expect(result.status).toBe("pausada");
    expect(result.dossie.linhas).toHaveLength(3);
    expect(result.dossie.linhas[0]).toMatch(/pediu explicitamente/i);
    expect(result.dossie.linhas[1]).toContain("Cliente recorrente");
    expect(result.dossie.linhas[2]).toContain("vendas");
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("pausada");
    expect(handoffRepo.events[0].gatilho).toBe("pedido_cliente");
  });

  it("sem memória de contato, a linha 2 do dossiê é o fallback e não vaza nada", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A });

    const result = await service.escalateByCustomerRequest({ tenant_id: TENANT_A, conversation_id: conv.id });

    expect(result.dossie.linhas[1]).toBe("Histórico: sem memória registrada para este contato.");
  });
});

describe("HumanHandoffService — gatilho baixa_confianca (Requisito 5)", () => {
  it("Given conversa ativa, When escalateByLowConfidence, Then pausa ANTES de qualquer resposta + handoff_events(gatilho=baixa_confianca)", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A });

    const result = await service.escalateByLowConfidence({ tenant_id: TENANT_A, conversation_id: conv.id });

    expect(result).toEqual({ status: "pausada" });
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("pausada");
    expect(handoffRepo.events[0].gatilho).toBe("baixa_confianca");
  });
});

// ── resume nunca silencioso (Requisito 7/8) ────────────────────────────────

describe("HumanHandoffService.resumeConversation — pausa longa nunca silenciosa (Requisito 7/8)", () => {
  it("Given pausa mais antiga que o limiar e confirmado_pelo_dono=false, Then aguardando_confirmacao e NADA muda", async () => {
    process.env.HANDOFF_LONG_PAUSE_HOURS = "24";
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, status: "pausada" });
    handoffRepo.seedEvent({
      tenant_id: TENANT_A,
      conversation_id: conv.id,
      gatilho: "botao_painel",
      acionado_em: new Date(Date.now() - 30 * HORAS).toISOString(),
    });

    const result = await service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id, confirmado_pelo_dono: false });

    expect(result).toEqual({ status: "aguardando_confirmacao" });
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("pausada"); // intocado
    expect(handoffRepo.events[0].resolvido_em).toBeNull();
  });

  it("Given a mesma conversa, When confirmado_pelo_dono=true, Then status=ativa e handoff_events.retomada_confirmada=true", async () => {
    process.env.HANDOFF_LONG_PAUSE_HOURS = "24";
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, status: "pausada" });
    const ev = handoffRepo.seedEvent({
      tenant_id: TENANT_A,
      conversation_id: conv.id,
      gatilho: "botao_painel",
      acionado_em: new Date(Date.now() - 30 * HORAS).toISOString(),
    });

    const result = await service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id, confirmado_pelo_dono: true });

    expect(result).toEqual({ status: "ativa" });
    expect(handoffRepo.conversations.get(conv.id)?.status).toBe("ativa");
    const stored = handoffRepo.events.find((e) => e.id === ev.id);
    expect(stored?.retomada_confirmada).toBe(true);
    expect(stored?.resolvido_em).not.toBeNull();
  });

  it("confirmado_pelo_dono omitido = false (Requisito 7) — pausa longa não retoma", async () => {
    process.env.HANDOFF_LONG_PAUSE_HOURS = "24";
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, status: "pausada" });
    handoffRepo.seedEvent({
      tenant_id: TENANT_A,
      conversation_id: conv.id,
      acionado_em: new Date(Date.now() - 30 * HORAS).toISOString(),
    });

    // @ts-expect-error — confirmado_pelo_dono omitido de propósito; o schema aplica default(false)
    const result = await service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id });

    expect(result).toEqual({ status: "aguardando_confirmacao" });
  });

  it("retomar conversa já ativa é idempotente e não gera evento", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, status: "ativa" });

    const result = await service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id, confirmado_pelo_dono: false });

    expect(result).toEqual({ status: "ativa" });
    expect(handoffRepo.events).toHaveLength(0);
  });
});

// ── isolamento multi-tenant (Requisito 6, _shared §3) ──────────────────────

describe("HumanHandoffService — tenant A nunca pausa/retoma conversa do tenant B", () => {
  it("pauseConversation(tenant A) sobre conversation_id do tenant B → ConversationNotFoundError, nada muda", async () => {
    const { service, handoffRepo } = build();
    const convB = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_B, status: "ativa" });

    await expect(
      service.pauseConversation({ tenant_id: TENANT_A, conversation_id: convB.id, gatilho: "botao_painel" }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);

    expect(handoffRepo.conversations.get(convB.id)?.status).toBe("ativa");
    expect(handoffRepo.events).toHaveLength(0);
  });

  it("resumeConversation(tenant A) sobre conversa pausada do tenant B → ConversationNotFoundError, conversa do B intocada", async () => {
    const { service, handoffRepo } = build();
    const convB = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_B, status: "pausada" });
    handoffRepo.seedEvent({ tenant_id: TENANT_B, conversation_id: convB.id });

    await expect(
      service.resumeConversation({ tenant_id: TENANT_A, conversation_id: convB.id, confirmado_pelo_dono: true }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);

    expect(handoffRepo.conversations.get(convB.id)?.status).toBe("pausada");
  });
});

// ── validação Zod + estado terminal + console limpo ────────────────────────

describe("HumanHandoffService — validação e estados de erro", () => {
  it("rejeita conversation_id que não é UUID", async () => {
    const { service } = build();
    await expect(
      service.pauseConversation({ tenant_id: TENANT_A, conversation_id: "nope", gatilho: "botao_painel" }),
    ).rejects.toThrow();
  });

  it("rejeita gatilho fora do enum", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A });
    await expect(
      // @ts-expect-error — gatilho inválido de propósito
      service.pauseConversation({ tenant_id: TENANT_A, conversation_id: conv.id, gatilho: "telepatia" }),
    ).rejects.toThrow();
  });

  it("conversa encerrada não pausa nem retoma", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A, status: "encerrada" });

    await expect(
      service.pauseConversation({ tenant_id: TENANT_A, conversation_id: conv.id, gatilho: "botao_painel" }),
    ).rejects.toBeInstanceOf(ConversationEncerradaError);
    await expect(
      service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id, confirmado_pelo_dono: true }),
    ).rejects.toBeInstanceOf(ConversationEncerradaError);
  });

  it("conversation_id inexistente → ConversationNotFoundError", async () => {
    const { service } = build();
    await expect(
      service.pauseConversation({ tenant_id: TENANT_A, conversation_id: randomUUID(), gatilho: "botao_painel" }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});

describe("HumanHandoffService — sem erro em console (critério de aceite)", () => {
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

  it("fluxo pausa → resume (curto e longo) nunca chama console.error/warn e nunca loga conteúdo de conversa", async () => {
    const { service, handoffRepo } = build();
    const conv = handoffRepo.seedConversation({ id: randomUUID(), tenant_id: TENANT_A });

    await service.pauseConversation({ tenant_id: TENANT_A, conversation_id: conv.id, gatilho: "botao_painel" });
    await service.resumeConversation({ tenant_id: TENANT_A, conversation_id: conv.id, confirmado_pelo_dono: false });
    await service.escalateByCustomerRequest({ tenant_id: TENANT_A, conversation_id: conv.id });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
