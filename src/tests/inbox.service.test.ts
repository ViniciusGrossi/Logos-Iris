import { describe, it, expect } from "vitest";

import { InboxService } from "@/services/inbox.service";
import type { ConversationSummaryRepository } from "@/repositories/conversation-summary.repository";
import type { ConversationSummary, MessageDTO } from "@/types/conversation-summary.types";

const TENANT_A = "00000000-0000-4000-8000-00000000a001";
const CONVERSATION_A = "00000000-0000-4000-8000-0000000d0001";

function summary(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: CONVERSATION_A,
    contact_nome: "Marcelo Andrade",
    contact_telefone: "+5511999998888",
    persona_ativa: "vendas",
    status: "ativa",
    pausada_ate: null,
    ultima_mensagem_preview: "oi",
    ultima_mensagem_em: new Date().toISOString(),
    ...overrides,
  };
}

class FakeConversationSummaryRepository implements ConversationSummaryRepository {
  listByTenantCalls: unknown[] = [];
  listMessagesCalls: unknown[] = [];
  items: ConversationSummary[] = [summary()];
  total = 1;
  messages: MessageDTO[] = [];
  messagesTotal = 0;

  async listByTenant(params: unknown) {
    this.listByTenantCalls.push(params);
    return { items: this.items, total: this.total };
  }
  async listMessages(params: unknown) {
    this.listMessagesCalls.push(params);
    return { items: this.messages, total: this.messagesTotal };
  }
}

describe("InboxService.listConversations — Requisito 1 (paginação obrigatória)", () => {
  it("page=1 default vira offset=0, limit=20 default", async () => {
    const repo = new FakeConversationSummaryRepository();
    const service = new InboxService(repo);

    const result = await service.listConversations({ tenant_id: TENANT_A });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(repo.listByTenantCalls[0]).toMatchObject({ tenantId: TENANT_A, limit: 20, offset: 0 });
  });

  it("page=3 com limit=10 vira offset=20", async () => {
    const repo = new FakeConversationSummaryRepository();
    const service = new InboxService(repo);

    await service.listConversations({ tenant_id: TENANT_A, page: 3, limit: 10 });

    expect(repo.listByTenantCalls[0]).toMatchObject({ limit: 10, offset: 20 });
  });

  it("repassa filtros status/persona ao Repository", async () => {
    const repo = new FakeConversationSummaryRepository();
    const service = new InboxService(repo);

    await service.listConversations({ tenant_id: TENANT_A, status: "pausada", persona: "sdr" });

    expect(repo.listByTenantCalls[0]).toMatchObject({ status: "pausada", persona: "sdr" });
  });
});

describe("InboxService.getConversationMessages — Requisito 2 (paginação)", () => {
  it("page=2 com limit=50 default vira offset=50", async () => {
    const repo = new FakeConversationSummaryRepository();
    const service = new InboxService(repo);

    await service.getConversationMessages({ tenant_id: TENANT_A, conversation_id: CONVERSATION_A, page: 2 });

    expect(repo.listMessagesCalls[0]).toMatchObject({
      tenantId: TENANT_A,
      conversationId: CONVERSATION_A,
      limit: 50,
      offset: 50,
    });
  });
});
