import { describe, it, expect, vi, beforeEach } from "vitest";

import { WhatsAppGatewayService } from "@/services/whatsapp-gateway.service";
import { EvolutionAdapter } from "@/adapters/whatsapp/evolution.adapter";
import { OpenWaAdapter } from "@/adapters/whatsapp/openwa.adapter";
import type { WhatsAppGatewayAdapter, WhatsAppConnectionRow } from "@/adapters/whatsapp/types";
import type { WhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import type { WebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import type { TenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import type { EngineMessageRepository } from "@/repositories/engine-message.repository";
import type { HandoffRepository } from "@/repositories/handoff.repository";
import type { QueueRepository } from "@/repositories/queue.repository";
import type { WhatsAppWebhookPayload } from "@/schemas/whatsapp-gateway.schema";
import { InvalidPayloadError } from "@/lib/whatsapp-gateway/errors";

// ── Fixtures cruas por provedor (trust boundary — formato nativo de cada provedor) ──

const evolutionFixtureFromMe = {
  instance: "tenant-instance",
  sender: "5511988887777@s.whatsapp.net",
  data: {
    key: { remoteJid: "5511999998888@s.whatsapp.net", fromMe: true, id: "EVO-MSG-1" },
    message: { conversation: "oi" },
    messageType: "conversation",
    messageTimestamp: 1719000000,
  },
};

const evolutionFixtureFromCustomer = {
  instance: "tenant-instance",
  sender: "5511988887777@s.whatsapp.net",
  data: {
    key: { remoteJid: "5511999998888@s.whatsapp.net", fromMe: false, id: "EVO-MSG-2" },
    message: { conversation: "quero orçamento" },
    messageType: "conversation",
    messageTimestamp: 1719000001,
  },
};

// fromMe TOP-LEVEL (caminho diferente do aninhado data.key.fromMe da Evolution) —
// prova o contrato de normalização único entre adapters (critério de aceite #2, ADR-029).
const openwaFixtureFromMe = {
  id: "OWA-MSG-1",
  from: "5511999998888@c.us",
  to: "5511988887777@c.us",
  body: "oi",
  type: "chat",
  timestamp: 1719000000,
  fromMe: true,
};

// ── Fakes (DI) — repositórios reais não são exercitados aqui; Service é testado isolado de DB ──

class FakeConnectionRepo implements WhatsAppConnectionRepository {
  async getByTenantId(): Promise<WhatsAppConnectionRow | null> {
    return null;
  }
  async updateSessionStatus(): Promise<void> {}
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

class FakeTenantLookupRepo implements TenantLookupRepository {
  constructor(private readonly byNumber: Record<string, string | null>) {}
  readonly calls: string[] = [];
  async findTenantIdByWhatsAppNumber(whatsappNumber: string): Promise<string | null> {
    this.calls.push(whatsappNumber);
    return this.byNumber[whatsappNumber] ?? null;
  }
}

class FakeEngineMessageRepo implements EngineMessageRepository {
  constructor(private readonly emitted: boolean) {}
  readonly calls: { tenantId: string; providerMessageId: string }[] = [];
  async wasEmittedByEngine(tenantId: string, providerMessageId: string): Promise<boolean> {
    this.calls.push({ tenantId, providerMessageId });
    return this.emitted;
  }
}

class FakeHandoffRepo implements HandoffRepository {
  constructor(private readonly conversationId: string | null) {}
  readonly findCalls: { tenantId: string; phone: string }[] = [];
  readonly pauseCalls: Parameters<HandoffRepository["pauseForHandoff"]>[0][] = [];
  async findActiveConversationId(tenantId: string, phone: string): Promise<string | null> {
    this.findCalls.push({ tenantId, phone });
    return this.conversationId;
  }
  async pauseForHandoff(
    params: Parameters<HandoffRepository["pauseForHandoff"]>[0]
  ): Promise<{ status: "pausada" }> {
    this.pauseCalls.push(params);
    return { status: "pausada" };
  }
}

class FakeQueueRepo implements QueueRepository {
  readonly calls: { tenantId: string; payload: WhatsAppWebhookPayload }[] = [];
  async enqueueInboundMessage(tenantId: string, payload: WhatsAppWebhookPayload): Promise<void> {
    this.calls.push({ tenantId, payload });
  }
}

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

function buildService(opts: {
  tenantByNumber: Record<string, string | null>;
  engineEmitted?: boolean;
  conversationId?: string | null;
  adapters?: Partial<Record<"evolution" | "openwa" | "cloud_api", WhatsAppGatewayAdapter>>;
}) {
  const connectionRepo = new FakeConnectionRepo();
  const webhookInboxRepo = new FakeWebhookInboxRepo();
  const tenantLookupRepo = new FakeTenantLookupRepo(opts.tenantByNumber);
  const engineMessageRepo = new FakeEngineMessageRepo(opts.engineEmitted ?? false);
  const handoffRepo = new FakeHandoffRepo(opts.conversationId ?? null);
  const queueRepo = new FakeQueueRepo();

  const service = new WhatsAppGatewayService({
    adapters: {
      evolution: opts.adapters?.evolution ?? new EvolutionAdapter(connectionRepo),
      openwa: opts.adapters?.openwa ?? new OpenWaAdapter(connectionRepo),
      cloud_api: opts.adapters?.cloud_api ?? new EvolutionAdapter(connectionRepo), // stub, não exercitado
    },
    webhookInboxRepo,
    tenantLookupRepo,
    engineMessageRepo,
    handoffRepo,
    queueRepo,
  });

  return { service, webhookInboxRepo, tenantLookupRepo, engineMessageRepo, handoffRepo, queueRepo };
}

describe("whatsapp-gateway — normalização fromMe por adapter (Requisito 2, ADR-029)", () => {
  it("critério #1: Evolution normaliza fromMe:true (nativo aninhado em data.key.fromMe) para from_me booleano canônico", () => {
    const adapter = new EvolutionAdapter(new FakeConnectionRepo());
    const payload = adapter.receive(evolutionFixtureFromMe);
    expect(payload.from_me).toBe(true);
    expect(payload.provider).toBe("evolution");
    expect(payload.message_id).toBe("EVO-MSG-1");
  });

  it("critério #2: OpenWA normaliza fromMe:true (nativo top-level, caminho diferente da Evolution) para o mesmo contrato canônico, sem vazar shape do provedor", () => {
    const adapter = new OpenWaAdapter(new FakeConnectionRepo());
    const payload = adapter.receive(openwaFixtureFromMe);
    expect(payload.from_me).toBe(true);
    expect(payload.provider).toBe("openwa");
    // nenhuma diferença de shape vaza pra fora do Gateway: só as 8 chaves canônicas existem.
    expect(Object.keys(payload).sort()).toEqual(
      ["content", "from", "from_me", "media_type", "message_id", "provider", "tenant_whatsapp_number", "timestamp"].sort()
    );
  });

  it("edge case: payload cru inválido lança InvalidPayloadError tipado (nunca throw genérico)", () => {
    const adapter = new EvolutionAdapter(new FakeConnectionRepo());
    expect(() => adapter.receive({ garbage: true })).toThrow(InvalidPayloadError);
  });
});

describe("whatsapp-gateway — idempotência (Requisito 3, ADR-028)", () => {
  it("critério #3: reentrega do provedor (mesmo provider_message_id) não enfileira 2x", async () => {
    const { service, queueRepo, webhookInboxRepo } = buildService({
      tenantByNumber: { "5511988887777": TENANT_A },
    });

    const first = await service.handleWebhook("evolution", evolutionFixtureFromCustomer);
    const second = await service.handleWebhook("evolution", evolutionFixtureFromCustomer);

    expect(first).toEqual({ received: true });
    expect(second).toEqual({ received: true });
    expect(webhookInboxRepo.calls).toHaveLength(2); // tentou registrar as 2x
    expect(queueRepo.calls).toHaveLength(1); // mas só enfileirou 1x
  });
});

describe("whatsapp-gateway — auto-pausa em from_me humano (Requisito 4, ADR-029, Story 22)", () => {
  it("critério #4: from_me=true e id não emitido pela engine aciona handoff e pausa a conversa", async () => {
    const { service, handoffRepo } = buildService({
      tenantByNumber: { "5511988887777": TENANT_A },
      engineEmitted: false,
      conversationId: "conv-1",
    });

    await service.handleWebhook("evolution", evolutionFixtureFromMe);

    expect(handoffRepo.pauseCalls).toHaveLength(1);
    expect(handoffRepo.pauseCalls[0]).toMatchObject({
      tenant_id: TENANT_A,
      conversation_id: "conv-1",
      gatilho: "from_me_detectado",
    });
  });

  it("critério #5: from_me=true mas id corresponde a envio da própria engine — nenhuma auto-pausa (falso-positivo evitado)", async () => {
    const { service, handoffRepo } = buildService({
      tenantByNumber: { "5511988887777": TENANT_A },
      engineEmitted: true,
      conversationId: "conv-1",
    });

    await service.handleWebhook("evolution", evolutionFixtureFromMe);

    expect(handoffRepo.pauseCalls).toHaveLength(0);
  });

  it("edge case: from_me=true, id não é da engine, mas não existe conversa ativa pro contato — no-op gracioso, sem throw", async () => {
    const { service, handoffRepo } = buildService({
      tenantByNumber: { "5511988887777": TENANT_A },
      engineEmitted: false,
      conversationId: null,
    });

    await expect(service.handleWebhook("evolution", evolutionFixtureFromMe)).resolves.toEqual({ received: true });
    expect(handoffRepo.pauseCalls).toHaveLength(0);
  });
});

describe("whatsapp-gateway — ACK rápido, sem processamento síncrono pesado (Requisito 5)", () => {
  it("critério #6: responde { received: true } sem aguardar LLM/processamento pesado (proxy: enfileira e retorna quase instantaneamente com deps fake)", async () => {
    const { service } = buildService({ tenantByNumber: { "5511988887777": TENANT_A } });

    const start = Date.now();
    const result = await service.handleWebhook("evolution", evolutionFixtureFromCustomer);
    const elapsedMs = Date.now() - start;

    expect(result).toEqual({ received: true });
    // proxy operacional: com dependências fake (sem I/O de rede/LLM), a resolução deve ser
    // essencialmente síncrona. A garantia estrutural real é: whatsapp-gateway.service.ts não
    // importa nenhum client de model-gateway/LLM (nenhuma chamada bloqueante possível).
    expect(elapsedMs).toBeLessThan(200);
  });
});

describe("whatsapp-gateway — RLS / isolamento tenant A × tenant B (Requisito de segurança, ADR-018)", () => {
  it.todo(
    "critério #7 (prova de DB, não unit test): webhook_inbox e whatsapp_connections RLS ON sem policy — " +
      "ver supabase/tests/01_rls_tenant_isolation.sql (assertion whatsapp_connections já existente + " +
      "assertion webhook_inbox adicionada por este worker, rodada via pgTAP contra o projeto live)"
  );

  it("defesa em profundidade: toda chamada de repositório usa o tenant_id resolvido do PRÓPRIO payload — tenant A nunca usa id de tenant B", async () => {
    const fixtureTenantB = {
      ...evolutionFixtureFromCustomer,
      sender: "5511977776666@s.whatsapp.net", // número de outro tenant
      data: { ...evolutionFixtureFromCustomer.data, key: { ...evolutionFixtureFromCustomer.data.key, id: "EVO-MSG-B1" } },
    };

    const { service, webhookInboxRepo, queueRepo } = buildService({
      tenantByNumber: {
        "5511988887777": TENANT_A,
        "5511977776666": TENANT_B,
      },
    });

    await service.handleWebhook("evolution", evolutionFixtureFromCustomer); // tenant A
    await service.handleWebhook("evolution", fixtureTenantB); // tenant B

    expect(webhookInboxRepo.calls).toEqual([
      { tenantId: TENANT_A, providerMessageId: "EVO-MSG-2" },
      { tenantId: TENANT_B, providerMessageId: "EVO-MSG-B1" },
    ]);
    expect(queueRepo.calls.map((c) => c.tenantId)).toEqual([TENANT_A, TENANT_B]);
  });

  it("edge case: número de WhatsApp sem tenant cadastrado — ACK sem registrar/enfileirar nada", async () => {
    const { service, webhookInboxRepo, queueRepo } = buildService({ tenantByNumber: {} });

    const result = await service.handleWebhook("evolution", evolutionFixtureFromCustomer);

    expect(result).toEqual({ received: true });
    expect(webhookInboxRepo.calls).toHaveLength(0);
    expect(queueRepo.calls).toHaveLength(0);
  });
});

describe("whatsapp-gateway — nenhum erro em console/logs (critério #8)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("fluxo de sucesso (mensagem nova, dedup, handoff) nunca escreve em console.error/console.log", async () => {
    const { service } = buildService({
      tenantByNumber: { "5511988887777": TENANT_A },
      engineEmitted: false,
      conversationId: "conv-1",
    });

    await service.handleWebhook("evolution", evolutionFixtureFromCustomer);
    await service.handleWebhook("evolution", evolutionFixtureFromCustomer); // dedup
    await service.handleWebhook("evolution", evolutionFixtureFromMe); // handoff

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
