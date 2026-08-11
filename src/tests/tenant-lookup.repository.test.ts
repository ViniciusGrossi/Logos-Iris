import { describe, it, expect } from "vitest";

import { SupabaseTenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

// ── tenant-router-queue — regressão do Requisito 5 (spec-reviewer aaff386f77f88e4f5, achado ALTO) ──
// findTenantIdByWhatsAppNumber tinha esquecido de filtrar status/deleted_at — tenant pausado,
// cancelado ou soft-deletado ainda resolvia tenant_id e roteava mensagem. Teste no nível do
// repository REAL (não do Fake usado em tenant-router-queue.test.ts): um spy mínimo da chain do
// client Supabase que GRAVA os filtros aplicados. Objetivo é travar a regressão (se alguém remover
// o .eq("status", "ativo")/.is("deleted_at", null) da implementação, este teste quebra), não só
// documentar a intenção com um resultado simulado.

const NUMBER_A = "+5511987650001";
const TENANT_A = "00000000-0000-0000-0000-0000000000a1";

type ChainCall = { method: string; args: unknown[] };

function buildClientSpy(result: { data: unknown; error: null }) {
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

describe("SupabaseTenantLookupRepository — filtro de tenant ativo (Requisito 5)", () => {
  it("aplica whatsapp_number + status='ativo' + deleted_at is null na mesma query (tenant ativo resolve)", async () => {
    const { db, calls } = buildClientSpy({ data: { id: TENANT_A }, error: null });
    const repo = new SupabaseTenantLookupRepository(db);

    const result = await repo.findTenantIdByWhatsAppNumber(NUMBER_A);

    expect(result).toBe(TENANT_A);
    expect(calls).toContainEqual({ method: "from", args: ["tenants"] });
    expect(calls).toContainEqual({ method: "eq", args: ["whatsapp_number", NUMBER_A] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "ativo"] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
  });

  it("regressão: tenant pausado/cancelado/soft-deletado nunca resolve — filtro chega ao server mesmo quando ele não encontra nada", async () => {
    // maybeSingle() retornando null simula o Postgres já aplicando o WHERE (status/deleted_at) —
    // o que este teste trava é que o REPOSITORY emitiu o filtro na chain, não que o Postgres filtra
    // (isso é coberto pelas migrations/pgTAP). Sem os .eq/.is, a chain nunca teria esses calls.
    const { db, calls } = buildClientSpy({ data: null, error: null });
    const repo = new SupabaseTenantLookupRepository(db);

    const result = await repo.findTenantIdByWhatsAppNumber(NUMBER_A);

    expect(result).toBeNull();
    expect(calls).toContainEqual({ method: "eq", args: ["status", "ativo"] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
  });

  it("propaga erro do client como Error tipado (nunca throw genérico/silencioso)", async () => {
    const chain = {
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => ({ data: null, error: { message: "conexão recusada" } }),
    };
    const repo = new SupabaseTenantLookupRepository(chain as unknown as IrisSupabaseClient);

    await expect(repo.findTenantIdByWhatsAppNumber(NUMBER_A)).rejects.toThrow(/tenants lookup falhou/);
  });
});
