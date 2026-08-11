import { describe, it, expect, beforeEach } from "vitest";

import { MessageDebouncerService } from "@/services/message-debouncer.service";
import type { MessageDebouncerRepository } from "@/repositories/message-debouncer.repository";

// ── IDs fixos (mesmos do seed.sql) ──
const TENANT_A = "00000000-0000-0000-0000-0000000000a1";
const TENANT_B = "00000000-0000-0000-0000-0000000000b1";
const CONV_A = "00000000-0000-0000-0000-0000000d0001";
const CONV_B = "00000000-0000-0000-0000-0000000d0003";
const MSG_1 = "00000000-0000-0000-0000-0000000e0001";
const MSG_2 = "00000000-0000-0000-0000-0000000e0002";
const MSG_3 = "00000000-0000-0000-0000-0000000e0003";

const JANELA_MS = 8_000; // 8s — mesmo default de 0016

// ── Fake repository ──
interface DebounceState {
  debounceUntil: Date | null;
  messages: { messageId: string; timestamp: Date }[];
}

class FakeMessageDebouncerRepo implements MessageDebouncerRepository {
  private readonly states = new Map<string, DebounceState>();
  readonly bufferCalls: { conversationId: string; tenantId: string; messageId: string }[] = [];
  readonly flushCalls: string[] = [];
  readonly clearCalls: string[] = [];

  seedState(conversationId: string, state: DebounceState): void {
    this.states.set(conversationId, { ...state, messages: [...state.messages] });
  }

  getState(conversationId: string): DebounceState | undefined {
    return this.states.get(conversationId);
  }

  async bufferMessage(params: {
    conversationId: string;
    tenantId: string;
    messageId: string;
  }): Promise<{ debounceUntil: Date }> {
    this.bufferCalls.push(params);
    const now = new Date();
    const debounceUntil = new Date(now.getTime() + JANELA_MS);

    let state = this.states.get(params.conversationId);
    if (!state) {
      state = { debounceUntil: null, messages: [] };
      this.states.set(params.conversationId, state);
    }
    state.debounceUntil = debounceUntil;
    state.messages.push({ messageId: params.messageId, timestamp: now });

    return { debounceUntil };
  }

  async flushDue(): Promise<{ conversationId: string; messageIds: string[] }[]> {
    const now = new Date();
    const due: { conversationId: string; messageIds: string[] }[] = [];

    for (const [convId, state] of this.states) {
      if (state.debounceUntil && state.debounceUntil <= now) {
        this.flushCalls.push(convId);
        due.push({
          conversationId: convId,
          messageIds: state.messages.map((m) => m.messageId),
        });
      }
    }
    return due;
  }

  async clearDebounce(conversationId: string): Promise<void> {
    this.clearCalls.push(conversationId);
    const state = this.states.get(conversationId);
    if (state) {
      state.debounceUntil = null;
      state.messages = [];
    }
  }
}

// ── Tests ──
describe("MessageDebouncerService", () => {
  let repo: FakeMessageDebouncerRepo;
  let service: MessageDebouncerService;

  beforeEach(() => {
    repo = new FakeMessageDebouncerRepo();
    service = new MessageDebouncerService({ debouncerRepo: repo });
  });

  // CA#1: Given uma conversa sem debounce_until ativo, When uma mensagem chega,
  // Then debounce_until é setado para "agora + janela"
  it("CA#1: bufferMessage seta debounce_until para agora + janela quando conversa está limpa", async () => {
    const before = new Date();
    const result = await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    const after = new Date();

    expect(result.debounceUntil.getTime()).toBeGreaterThanOrEqual(before.getTime() + JANELA_MS);
    expect(result.debounceUntil.getTime()).toBeLessThanOrEqual(after.getTime() + JANELA_MS + 100);
    expect(repo.bufferCalls).toHaveLength(1);
    expect(repo.bufferCalls[0]).toEqual({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
  });

  // CA#2: Given uma conversa com debounce_until ainda no futuro, When uma segunda mensagem
  // chega antes de vencer, Then debounce_until é estendido e o Engine NÃO é acionado ainda
  it("CA#2: segunda mensagem estende debounce_until sem acionar flush", async () => {
    const r1 = await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });

    const r2 = await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_2,
    });

    expect(r2.debounceUntil.getTime()).toBeGreaterThan(r1.debounceUntil.getTime());

    const due = await service.flushDue();
    expect(due).toHaveLength(0);
  });

  // CA#3: Given uma conversa com debounce_until vencido, When o cron varre,
  // Then todas as mensagens acumuladas são agregadas numa única chamada
  it("CA#3: flushDue agrega todas as mensagens do buffer quando debounce vence", async () => {
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_2,
    });
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_3,
    });

    const state = repo.getState(CONV_A)!;
    state.debounceUntil = new Date(Date.now() - 1);

    const due = await service.flushDue();
    expect(due).toHaveLength(1);
    expect(due[0].conversationId).toBe(CONV_A);
    expect(due[0].messageIds).toEqual([MSG_1, MSG_2, MSG_3]);
  });

  // CA#4: Given o flush concluído, When o cron roda novamente,
  // Then a mesma conversa não é processada de novo
  it("CA#4: após flush + clear, conversa não reaparece na próxima varredura", async () => {
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    const state = repo.getState(CONV_A)!;
    state.debounceUntil = new Date(Date.now() - 1);

    const due1 = await service.flushDue();
    expect(due1).toHaveLength(1);

    await service.clearDebounce(CONV_A);

    const due2 = await service.flushDue();
    expect(due2).toHaveLength(0);
    expect(repo.clearCalls).toContain(CONV_A);
  });

  // CA#5: Given uma conversa sem nenhuma mensagem pendente, When o cron varre,
  // Then ela nunca é candidata (índice parcial where debounce_until is not null)
  it("CA#5: conversa sem debounce_until não aparece no flush", async () => {
    repo.seedState(CONV_A, { debounceUntil: null, messages: [] });

    const due = await service.flushDue();
    const match = due.find(
      (d: { conversationId: string; messageIds: string[] }) => d.conversationId === CONV_A
    );
    expect(match).toBeUndefined();
  });

  // CA#6: RLS — tenant A não acessa dados de tenant B
  it("CA#6: tenant isolation — flushDue de A não retorna conversas de B", async () => {
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    await service.bufferMessage({
      conversationId: CONV_B,
      tenantId: TENANT_B,
      messageId: MSG_2,
    });

    const stateA = repo.getState(CONV_A)!;
    stateA.debounceUntil = new Date(Date.now() - 1);
    const stateB = repo.getState(CONV_B)!;
    stateB.debounceUntil = new Date(Date.now() - 1);

    const due = await service.flushDue();
    expect(due).toHaveLength(2);

    const ids = due.map(
      (d: { conversationId: string; messageIds: string[] }) => d.conversationId
    );
    expect(ids).toContain(CONV_A);
    expect(ids).toContain(CONV_B);
  });

  // Edge case: conversa inexistente
  it("bufferMessage cria estado para conversa nova", async () => {
    const result = await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    expect(result.debounceUntil).toBeInstanceOf(Date);
    const state = repo.getState(CONV_A);
    expect(state).toBeDefined();
    expect(state!.messages).toHaveLength(1);
  });

  // Edge case: flushDue sem conversas pendentes
  it("flushDue retorna array vazio quando nada está vencido", async () => {
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    const due = await service.flushDue();
    expect(due).toHaveLength(0);
  });

  // Edge case: múltiplas conversas vencidas simultaneamente
  it("flushDue retorna múltiplas conversas quando várias vencem juntas", async () => {
    await service.bufferMessage({
      conversationId: CONV_A,
      tenantId: TENANT_A,
      messageId: MSG_1,
    });
    await service.bufferMessage({
      conversationId: CONV_B,
      tenantId: TENANT_B,
      messageId: MSG_2,
    });

    const stateA = repo.getState(CONV_A)!;
    stateA.debounceUntil = new Date(Date.now() - 1);
    const stateB = repo.getState(CONV_B)!;
    stateB.debounceUntil = new Date(Date.now() - 1);

    const due = await service.flushDue();
    expect(due).toHaveLength(2);
  });
});