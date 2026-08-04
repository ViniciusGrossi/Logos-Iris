import { describe, it, expect, vi, beforeEach } from "vitest";

import { TenantRouterService } from "@/services/tenant-router.service";
import { InvalidQueueMessageError } from "@/services/tenant-router.errors";
import type { ConversationRoutingRepository } from "@/repositories/conversation-routing.repository";
import type { WebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import type { TenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import type { WhatsAppWebhookPayload } from "@/schemas/whatsapp-gateway.schema";

// ── IDs fixos (mesmos do seed.sql, p/ paridade com o pgTAP de concorrência) ──
const TENANT_A = "00000000-0000-0000-0000-0000000000a1";
const TENANT_B = "00000000-0000-0000-0000-0000000000b1";
const NUMBER_A = "+5511987650001";
const NUMBER_B = "+5511987650002";
const CONV_A = "00000000-0000-0000-0000-0000000d0001";
const CONV_B = "00000000-0000-0000-0000-0000000d0003";

// ── Item CONSUMIDO da fila whatsapp_inbound (produzido pelo gateway: WhatsAppWebhookPayload) ──
// O gateway inclui um tenant_id redundante; o Router NÃO confia nele — re-resolve por
// tenant_whatsapp_number (Requisito 1 + critério RLS). Fixtures aqui trazem só o payload canônico.
function inboundItem(overrides: Partial<WhatsAppWebhookPayload> = {}): WhatsAppWebhookPayload {
  return {
    provider: "evolution",
    tenant_whatsapp_number: NUMBER_A,
    from: "+5511911110001",
    message_id: "EVO-MSG-1",
    content: "oi",
    media_type: "texto",
    from_me: false,
    timestamp: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

// ── Fakes (DI) — repositórios reais não exercitados; Service testado isolado de DB ──

class FakeTenantLookupRepo implements TenantLookupRepository {
  constructor(private readonly byNumber: Record<string, string | null>) {}
  readonly calls: string[] = [];
  async findTenantIdByWhatsAppNumber(whatsappNumber: string): Promise<string | null> {
    this.calls.push(whatsappNumber);
    return this.byNumber[whatsappNumber] ?? null;
  }
}

class FakeWebhookInboxRepo implements WebhookInboxRepository {
  private readonly seen = new Set<string>();
  readonly calls: { tenantId: string; providerMessageId: string }[] = [];
  async insertIfNew(tenantId: string, providerMessageId: string): Promise<boolean> {
    this.calls.push({ tenantId, providerMessageId });
    const key = `${tenantId}:${providerMessageId}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

class FakeConversationRoutingRepo implements ConversationRoutingRepository {
  // resolve conversa por (tenant, from) — simula o find-or-create + advisory lock do SQL.
  constructor(private readonly byKey: Record<string, string>) {}
  readonly calls: { tenantId: string; from: string; messageId: string }[] = [];
  async routeUnderConversationLock(params: {
    tenantId: string;
    payload: WhatsAppWebhookPayload;
  }): Promise<{ conversationId: string }> {
    this.calls.push({ tenantId: params.tenantId, from: params.payload.from, messageId: params.payload.message_id });
    const key = `${params.tenantId}:${params.payload.from}`;
    return { conversationId: this.byKey[key] ?? "00000000-0000-0000-0000-00000000dead" };
  }
}

function buildService(opts: {
  tenantByNumber: Record<string, string | null>;
  convByKey?: Record<string, string>;
}) {
  const tenantLookupRepo = new FakeTenantLookupRepo(opts.tenantByNumber);
  const webhookInboxRepo = new FakeWebhookInboxRepo();
  const conversationRoutingRepo = new FakeConversationRoutingRepo(opts.convByKey ?? {});
  const service = new TenantRouterService({ tenantLookupRepo, webhookInboxRepo, conversationRoutingRepo });
  return { service, tenantLookupRepo, webhookInboxRepo, conversationRoutingRepo };
}

describe("tenant-router-queue — resolução de tenant (Requisito 1)", () => {
  it("critério #1: número cadastrado em tenants.whatsapp_number resolve para o tenant_id correto", async () => {
    const { service } = buildService({ tenantByNumber: { [NUMBER_A]: TENANT_A } });
    await expect(service.resolveTenant({ tenant_whatsapp_number: NUMBER_A })).resolves.toEqual({ tenant_id: TENANT_A });
  });

  it("critério #2 (parte): número não cadastrado resolve para null", async () => {
    const { service } = buildService({ tenantByNumber: {} });
    await expect(service.resolveTenant({ tenant_whatsapp_number: "+5511900000000" })).resolves.toBeNull();
  });

  it("edge: tenant_whatsapp_number vazio lança erro tipado (Zod), nunca throw genérico", async () => {
    const { service } = buildService({ tenantByNumber: {} });
    await expect(service.resolveTenant({ tenant_whatsapp_number: "" })).rejects.toBeInstanceOf(InvalidQueueMessageError);
  });
});

describe("tenant-router-queue — descarte de número órfão (Requisito 5)", () => {
  it("critério #2: número sem tenant ativo é descartado sem exceção, sem dedup nem roteamento", async () => {
    const { service, webhookInboxRepo, conversationRoutingRepo } = buildService({ tenantByNumber: {} });

    const result = await service.routeInbound(inboundItem({ tenant_whatsapp_number: "+5511900000000" }));

    expect(result).toEqual({ status: "descartada" });
    expect(webhookInboxRepo.calls).toHaveLength(0);
    expect(conversationRoutingRepo.calls).toHaveLength(0);
  });
});

describe("tenant-router-queue — idempotência no ponto de entrada da fila (Requisito 4, ADR-028)", () => {
  it("critério #5: mesmo provider_message_id não roteia 2x — segunda entrega é duplicada", async () => {
    const { service, conversationRoutingRepo, webhookInboxRepo } = buildService({
      tenantByNumber: { [NUMBER_A]: TENANT_A },
      convByKey: { [`${TENANT_A}:+5511911110001`]: CONV_A },
    });

    const first = await service.routeInbound(inboundItem());
    const second = await service.routeInbound(inboundItem());

    expect(first).toEqual({ status: "roteada", tenant_id: TENANT_A, conversation_id: CONV_A });
    expect(second).toEqual({ status: "duplicada", tenant_id: TENANT_A });
    expect(webhookInboxRepo.calls).toHaveLength(2); // tentou registrar as 2x
    expect(conversationRoutingRepo.calls).toHaveLength(1); // mas só roteou 1x
  });
});

describe("tenant-router-queue — roteamento sob lock por conversa (Requisitos 2 e 3)", () => {
  it("critério #1/#2: mensagem válida resolve conversa e roteia sob advisory lock (delegado ao repo/SQL)", async () => {
    const { service, conversationRoutingRepo } = buildService({
      tenantByNumber: { [NUMBER_A]: TENANT_A },
      convByKey: { [`${TENANT_A}:+5511911110001`]: CONV_A },
    });

    const result = await service.routeInbound(inboundItem());

    expect(result).toEqual({ status: "roteada", tenant_id: TENANT_A, conversation_id: CONV_A });
    expect(conversationRoutingRepo.calls).toEqual([{ tenantId: TENANT_A, from: "+5511911110001", messageId: "EVO-MSG-1" }]);
  });

  it.todo(
    "critério #3/#4 (prova de DB, não unit test): pg_advisory_xact_lock(hashtext(conversation_id)) serializa " +
      "mesma conversa e paraleliza conversas distintas — assertion em supabase/tests/05_tenant_router_advisory_lock.sql " +
      "(exige 2 sessões Postgres reais, impossível provar com fake em memória)"
  );
});

describe("tenant-router-queue — isolamento tenant A × tenant B (critério RLS, ADR-018)", () => {
  it("critério #6: cada mensagem roteia sob o tenant_id resolvido do PRÓPRIO número — A nunca usa id de B", async () => {
    const { service, webhookInboxRepo, conversationRoutingRepo } = buildService({
      tenantByNumber: { [NUMBER_A]: TENANT_A, [NUMBER_B]: TENANT_B },
      convByKey: {
        [`${TENANT_A}:+5511911110001`]: CONV_A,
        [`${TENANT_B}:+5511922220001`]: CONV_B,
      },
    });

    const rA = await service.routeInbound(inboundItem({ tenant_whatsapp_number: NUMBER_A, from: "+5511911110001", message_id: "A-1" }));
    const rB = await service.routeInbound(inboundItem({ tenant_whatsapp_number: NUMBER_B, from: "+5511922220001", message_id: "B-1" }));

    expect(rA).toEqual({ status: "roteada", tenant_id: TENANT_A, conversation_id: CONV_A });
    expect(rB).toEqual({ status: "roteada", tenant_id: TENANT_B, conversation_id: CONV_B });
    expect(webhookInboxRepo.calls).toEqual([
      { tenantId: TENANT_A, providerMessageId: "A-1" },
      { tenantId: TENANT_B, providerMessageId: "B-1" },
    ]);
    expect(conversationRoutingRepo.calls.map((c) => c.tenantId)).toEqual([TENANT_A, TENANT_B]);
  });

  it("critério #6 (defesa): tenant_id redundante do gateway no item é IGNORADO — só o resolvido do número vale", async () => {
    const { service, conversationRoutingRepo } = buildService({
      tenantByNumber: { [NUMBER_A]: TENANT_A },
      convByKey: { [`${TENANT_A}:+5511911110001`]: CONV_A },
    });

    // item malicioso: número de A, mas tenta injetar tenant_id de B
    const result = await service.routeInbound({ ...inboundItem(), tenant_id: TENANT_B });

    expect(result).toEqual({ status: "roteada", tenant_id: TENANT_A, conversation_id: CONV_A });
    expect(conversationRoutingRepo.calls[0].tenantId).toBe(TENANT_A); // nunca B
  });
});

describe("tenant-router-queue — trust boundary da fila (item malformado)", () => {
  it("item de fila malformado lança InvalidQueueMessageError tipado (nunca throw genérico / 500 cru)", async () => {
    const { service } = buildService({ tenantByNumber: { [NUMBER_A]: TENANT_A } });
    await expect(service.routeInbound({ lixo: true })).rejects.toBeInstanceOf(InvalidQueueMessageError);
  });
});

describe("tenant-router-queue — nenhum erro em console/logs (critério #7)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("fluxos de sucesso, dedup e descarte nunca escrevem em console.error/console.log", async () => {
    const { service } = buildService({
      tenantByNumber: { [NUMBER_A]: TENANT_A },
      convByKey: { [`${TENANT_A}:+5511911110001`]: CONV_A },
    });

    await service.routeInbound(inboundItem()); // sucesso
    await service.routeInbound(inboundItem()); // dedup
    await service.routeInbound(inboundItem({ tenant_whatsapp_number: "+5511900000000" })); // descarte

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
