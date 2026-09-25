import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { useInbox } from "@/hooks/use-inbox";

// Logos Iris — painel-cliente-v1: useInbox troca @/mocks/conversations por ListConversations/
// GetConversationMessages reais (Requisitos 1/2), e pause/resume (Requisitos 3/4).

const CONVERSATION_ROW = {
  id: "c1",
  contact_nome: "Marcelo Andrade",
  contact_telefone: "+5511999998888",
  persona_ativa: "vendas",
  status: "ativa",
  pausada_ate: null,
  ultima_mensagem_preview: "Fecho o pacote então",
  ultima_mensagem_em: new Date().toISOString(),
};

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("useInbox — 3 estados", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("state='content' e mapeia ConversationSummary -> Conversation (contactName/persona/unread)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ items: [CONVERSATION_ROW], total: 1, page: 1, limit: 20 }));

    const { result } = renderHook(() => useInbox());

    await waitFor(() => expect(result.current.state).toBe("content"));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]).toMatchObject({
      id: "c1",
      contactName: "Marcelo Andrade",
      contactInitial: "M",
      persona: "vendas",
      unread: false,
    });
  });

  it("state='empty' quando ListConversations não devolve itens", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, limit: 20 }));

    const { result } = renderHook(() => useInbox());

    await waitFor(() => expect(result.current.state).toBe("empty"));
  });

  it("state='error' quando o fetch falha", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useInbox());

    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("Requisito 4: resume com status='aguardando_confirmacao' NUNCA reativa direto — exibe confirmação", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ items: [CONVERSATION_ROW], total: 1, page: 1, limit: 20 }));

    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.state).toBe("content"));

    act(() => result.current.setSelectedId("c1"));
    await waitFor(() => expect(result.current.selectedId).toBe("c1"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "aguardando_confirmacao" }));
    await act(async () => {
      await result.current.resumeSelected();
    });

    expect(result.current.showResumeConfirm).toBe(true);
    // Garante que o 2º POST (confirmado_pelo_dono=true) NÃO foi disparado automaticamente.
    const resumeCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/resume"));
    expect(resumeCalls).toHaveLength(1);
  });

  it("Requisito 4: confirmResume envia confirmado_pelo_dono=true e fecha o diálogo", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ items: [CONVERSATION_ROW], total: 1, page: 1, limit: 20 }));

    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.state).toBe("content"));
    act(() => result.current.setSelectedId("c1"));
    await waitFor(() => expect(result.current.selectedId).toBe("c1"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ativa" }));
    await act(async () => {
      await result.current.confirmResume();
    });

    expect(result.current.showResumeConfirm).toBe(false);
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes("/resume")) ?? [];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ confirmado_pelo_dono: true });
  });
});
