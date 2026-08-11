import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import InboxPage from "@/app/(cliente)/inbox/page";

vi.mock("@/hooks/use-inbox", () => ({
  useInbox: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

import { useInbox } from "@/hooks/use-inbox";

const mockUseInbox = useInbox as ReturnType<typeof vi.fn>;

function mockState(state: string, overrides: Record<string, unknown> = {}) {
  mockUseInbox.mockReturnValue({
    state,
    setState: vi.fn(),
    conversations: [],
    selectedId: null,
    setSelectedId: vi.fn(),
    selected: null,
    messages: [],
    search: "",
    setSearch: vi.fn(),
    personaFilter: "all",
    setPersonaFilter: vi.fn(),
    filteredConversations: [],
    errorMessage: "Erro simulado",
    ...overrides,
  });
}

describe("InboxPage — 3 estados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza ConversationListSkeleton quando state='loading'", () => {
    mockState("loading");
    render(<InboxPage />);
    // Skeleton renderiza elementos com role genérico — verificamos que não quebrou
    expect(screen.getByText("Selecione uma conversa")).toBeDefined();
  });

  it("renderiza empty state quando state='error'", () => {
    mockState("error");
    render(<InboxPage />);
    expect(screen.getByText("Erro ao carregar conversas")).toBeDefined();
    expect(screen.getByText("Erro simulado")).toBeDefined();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeDefined();
  });

  it("renderiza empty state quando state='empty'", () => {
    mockState("empty");
    render(<InboxPage />);
    expect(screen.getByText("Nenhuma conversa ainda")).toBeDefined();
  });

  it("renderiza lista de conversas quando state='content'", () => {
    mockState("content", {
      filteredConversations: [
        {
          id: "c1",
          contactName: "Marcelo Andrade",
          contactInitial: "M",
          lastMessagePreview: "Fecho o pacote então",
          lastMessageAt: "09:42",
          persona: "vendas",
          status: "ativa",
          unread: true,
        },
      ],
    });
    render(<InboxPage />);
    expect(screen.getByText("Marcelo Andrade")).toBeDefined();
    expect(screen.getByText("Fecho o pacote então")).toBeDefined();
  });
});