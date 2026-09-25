import { describe, it, expect } from "vitest";

import { SupabaseWhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

// ── ALTO-2 (review de segurança fase 9, fix migração 0024) ──
// evolution.adapter.ts/openwa.adapter.ts/cloud-api.adapter.ts liam connection.credentials_ref como
// se já fosse o segredo em claro, mas a coluna é só uma REFERÊNCIA ao Supabase Vault ('vault:...').
// getByTenantId continua devolvendo a coluna CRUA (barato, sem side-effect de Vault) — só
// status()/pareamento() a usam, e não precisam da credencial. resolveCredentials() é chamado à
// parte, só por send()/pareamento() nos 3 adapters, exatamente onde a credencial é de fato usada
// (achado do /code-review: resolver sempre em getByTenantId quebrava status()/pareamento() pra
// tenants sem secret cadastrado no Vault ainda).

const TENANT_A = "00000000-0000-0000-0000-0000000000a1";

function buildClientSpy(params: {
  connectionRow: Record<string, unknown> | null;
  resolvedSecret?: string | null;
  resolveError?: { message: string } | null;
}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const fromChain = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return fromChain;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return fromChain;
    },
    maybeSingle: async () => ({ data: params.connectionRow, error: null }),
  };

  const client = {
    from(...args: unknown[]) {
      calls.push({ method: "from", args });
      return fromChain;
    },
    rpc: async (fn: string, rpcArgs: unknown) => {
      calls.push({ method: "rpc", args: [fn, rpcArgs] });
      return { data: params.resolvedSecret ?? null, error: params.resolveError ?? null };
    },
  };

  return { db: client as unknown as IrisSupabaseClient, calls };
}

const BASE_ROW = {
  tenant_id: TENANT_A,
  provider: "evolution",
  instance_id: "bella-estetica-01",
  credentials_ref: "vault:iris/bella-estetica/evolution",
  session_status: "conectado",
  updated_at: new Date().toISOString(),
};

describe("SupabaseWhatsAppConnectionRepository.getByTenantId — nunca resolve Vault por conta própria", () => {
  it("devolve credentials_ref CRU (referência), sem chamar a RPC de resolução", async () => {
    const { db, calls } = buildClientSpy({ connectionRow: BASE_ROW });
    const repo = new SupabaseWhatsAppConnectionRepository(db);

    const result = await repo.getByTenantId(TENANT_A);

    expect(result?.credentials_ref).toBe("vault:iris/bella-estetica/evolution");
    expect(calls.some((c) => c.method === "rpc")).toBe(false);
  });

  it("tenant sem conexão: retorna null", async () => {
    const { db } = buildClientSpy({ connectionRow: null });
    const repo = new SupabaseWhatsAppConnectionRepository(db);

    expect(await repo.getByTenantId(TENANT_A)).toBeNull();
  });
});

describe("SupabaseWhatsAppConnectionRepository.resolveCredentials — usado só por send()/pareamento()", () => {
  it("resolve credentials_ref via RPC e devolve o segredo real", async () => {
    const { db, calls } = buildClientSpy({ connectionRow: BASE_ROW, resolvedSecret: "segredo-real-evolution" });
    const repo = new SupabaseWhatsAppConnectionRepository(db);

    const result = await repo.resolveCredentials(TENANT_A);

    expect(result).toBe("segredo-real-evolution");
    expect(calls).toContainEqual({
      method: "rpc",
      args: ["resolve_whatsapp_credentials", { p_tenant_id: TENANT_A }],
    });
  });

  it("RPC sem secret cadastrado no Vault (resolved=null): lança erro explícito, nunca devolve credential vazia/silenciosa", async () => {
    const { db } = buildClientSpy({ connectionRow: BASE_ROW, resolvedSecret: null });
    const repo = new SupabaseWhatsAppConnectionRepository(db);

    await expect(repo.resolveCredentials(TENANT_A)).rejects.toThrow(/credentials_ref ausente/);
  });

  it("RPC retorna erro: propaga como Error tipado (nunca throw genérico/silencioso)", async () => {
    const { db } = buildClientSpy({
      connectionRow: BASE_ROW,
      resolvedSecret: null,
      resolveError: { message: "nenhum secret no Vault com nome" },
    });
    const repo = new SupabaseWhatsAppConnectionRepository(db);

    await expect(repo.resolveCredentials(TENANT_A)).rejects.toThrow(/resolve_whatsapp_credentials falhou/);
  });
});
