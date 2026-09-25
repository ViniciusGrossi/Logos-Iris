import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useDashboard } from "@/hooks/use-dashboard";

// Logos Iris — painel-cliente-v1: useDashboard troca @/mocks/signals por GetDailySummary real
// (Requisitos 5/6). Testa os 3 estados via fetch mockado — não bate no Supabase de verdade.

describe("useDashboard — 3 estados", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("state='content' quando GetDailySummary retorna dados — mapeia os 4 campos do contrato, sem foraDoCatalogo", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        total_conversas: 23,
        orcamentos_gerados: 4,
        agendamentos_criados: 2,
        leads_quentes: [{ conversation_id: "c1", resumo: "Lead quente" }],
      }),
    });

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.state).toBe("content"));
    expect(result.current.totals).toEqual({ conversas: 23, orcamentos: 4, agendamentos: 2 });
    expect(result.current.leadsQuentes).toEqual([{ conversation_id: "c1", resumo: "Lead quente" }]);
  });

  it("state='empty' quando total_conversas=0 e leads_quentes=[]", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ total_conversas: 0, orcamentos_gerados: 0, agendamentos_criados: 0, leads_quentes: [] }),
    });

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.state).toBe("empty"));
  });

  it("state='error' quando o fetch falha (HTTP não-ok)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("state='loading' é o valor inicial, antes do fetch resolver", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDashboard());

    expect(result.current.state).toBe("loading");
  });
});
