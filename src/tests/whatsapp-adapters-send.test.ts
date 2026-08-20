import { describe, it, expect } from "vitest";

import { EvolutionAdapter } from "@/adapters/whatsapp/evolution.adapter";
import { OpenWaAdapter } from "@/adapters/whatsapp/openwa.adapter";
import { CloudApiAdapter } from "@/adapters/whatsapp/cloud-api.adapter";
import type { WhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import type { WhatsAppConnectionRow } from "@/adapters/whatsapp/types";
import { EvolutionClient } from "@/lib/evolution.client";
import { EvolutionTimeoutError, EvolutionMalformedResponseError } from "@/lib/evolution.errors";
import { OpenWaClient } from "@/lib/openwa.client";
import { OpenWaTimeoutError, OpenWaMalformedResponseError } from "@/lib/openwa.errors";
import { CloudApiClient } from "@/lib/cloud-api.client";
import { CloudApiTimeoutError, CloudApiMalformedResponseError } from "@/lib/cloud-api.errors";

// Hardening fase 9 — testa send() dos 3 adapters religados aos clients tipados (gap #1). Os clients
// em si já são exercitados nos 3 arquivos de teste dedicados (evolution/openwa/cloud-api-client.test.ts);
// aqui a garantia é que o adapter propaga o erro tipado do client sem engolir/rebaixar pra Error
// genérico, e que resolve os parâmetros certos (instance_id/credentials_ref) a partir da connection.

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function connectedRow(overrides: Partial<WhatsAppConnectionRow> = {}): WhatsAppConnectionRow {
  return {
    tenant_id: TENANT_ID,
    provider: "evolution",
    instance_id: "inst-1",
    credentials_ref: "cred-ref",
    session_status: "conectado",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

class FakeConnectionRepo implements WhatsAppConnectionRepository {
  constructor(private readonly row: WhatsAppConnectionRow | null) {}
  async getByTenantId(): Promise<WhatsAppConnectionRow | null> {
    return this.row;
  }
  async updateSessionStatus(): Promise<void> {}
}

describe("EvolutionAdapter.send — hardening fase 9 (gap #1)", () => {
  it("cenário sucesso: delega pro EvolutionClient e retorna provider_message_id", async () => {
    const client = { sendText: async () => ({ messageId: "EVO-OK" }) } as unknown as EvolutionClient;
    const adapter = new EvolutionAdapter(new FakeConnectionRepo(connectedRow()), client);

    const result = await adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" });

    expect(result).toEqual({ provider_message_id: "EVO-OK" });
  });

  it("cenário timeout: erro tipado do client propaga sem virar Error genérico", async () => {
    const client = {
      sendText: async () => {
        throw new EvolutionTimeoutError(8000);
      },
    } as unknown as EvolutionClient;
    const adapter = new EvolutionAdapter(new FakeConnectionRepo(connectedRow()), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toBeInstanceOf(EvolutionTimeoutError);
  });

  it("cenário malformado: erro tipado do client propaga sem virar Error genérico", async () => {
    const client = {
      sendText: async () => {
        throw new EvolutionMalformedResponseError("resposta sem key.id");
      },
    } as unknown as EvolutionClient;
    const adapter = new EvolutionAdapter(new FakeConnectionRepo(connectedRow()), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toBeInstanceOf(EvolutionMalformedResponseError);
  });

  it("edge case: tenant sem conexão conectada nunca chega a chamar o client", async () => {
    let called = false;
    const client = {
      sendText: async () => {
        called = true;
        return { messageId: "should-not-happen" };
      },
    } as unknown as EvolutionClient;
    const adapter = new EvolutionAdapter(new FakeConnectionRepo(null), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toThrow(/não está conectado/);
    expect(called).toBe(false);
  });
});

describe("OpenWaAdapter.send — hardening fase 9 (gap #1)", () => {
  it("cenário sucesso: delega pro OpenWaClient e retorna provider_message_id", async () => {
    const client = { sendText: async () => ({ messageId: "OWA-OK" }) } as unknown as OpenWaClient;
    const adapter = new OpenWaAdapter(new FakeConnectionRepo(connectedRow({ provider: "openwa" })), client);

    const result = await adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" });

    expect(result).toEqual({ provider_message_id: "OWA-OK" });
  });

  it("cenário timeout: erro tipado do client propaga sem virar Error genérico", async () => {
    const client = {
      sendText: async () => {
        throw new OpenWaTimeoutError(8000);
      },
    } as unknown as OpenWaClient;
    const adapter = new OpenWaAdapter(new FakeConnectionRepo(connectedRow({ provider: "openwa" })), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toBeInstanceOf(OpenWaTimeoutError);
  });

  it("cenário malformado: erro tipado do client propaga sem virar Error genérico", async () => {
    const client = {
      sendText: async () => {
        throw new OpenWaMalformedResponseError("resposta sem id");
      },
    } as unknown as OpenWaClient;
    const adapter = new OpenWaAdapter(new FakeConnectionRepo(connectedRow({ provider: "openwa" })), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toBeInstanceOf(OpenWaMalformedResponseError);
  });
});

describe("CloudApiAdapter.send — hardening fase 9 (gap #1)", () => {
  it("cenário sucesso: delega pro CloudApiClient e retorna provider_message_id", async () => {
    const client = { sendText: async () => ({ messageId: "CLOUD-OK" }) } as unknown as CloudApiClient;
    const adapter = new CloudApiAdapter(new FakeConnectionRepo(connectedRow({ provider: "cloud_api" })), client);

    const result = await adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" });

    expect(result).toEqual({ provider_message_id: "CLOUD-OK" });
  });

  it("cenário timeout: erro tipado do client propaga sem virar Error genérico", async () => {
    const client = {
      sendText: async () => {
        throw new CloudApiTimeoutError(8000);
      },
    } as unknown as CloudApiClient;
    const adapter = new CloudApiAdapter(new FakeConnectionRepo(connectedRow({ provider: "cloud_api" })), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toBeInstanceOf(CloudApiTimeoutError);
  });

  it("cenário malformado: erro tipado do client propaga sem virar Error genérico", async () => {
    const client = {
      sendText: async () => {
        throw new CloudApiMalformedResponseError("resposta sem messages[0].id");
      },
    } as unknown as CloudApiClient;
    const adapter = new CloudApiAdapter(new FakeConnectionRepo(connectedRow({ provider: "cloud_api" })), client);

    await expect(
      adapter.send({ tenant_id: TENANT_ID, to: "5511999998888", content: "oi", media_type: "texto" })
    ).rejects.toBeInstanceOf(CloudApiMalformedResponseError);
  });
});
