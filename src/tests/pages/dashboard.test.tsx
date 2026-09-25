import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/(cliente)/dashboard/page";

vi.mock("@/hooks/use-dashboard", () => ({
  useDashboard: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

import { useDashboard } from "@/hooks/use-dashboard";

const mockUseDashboard = useDashboard as ReturnType<typeof vi.fn>;

function mockState(state: string, overrides: Record<string, unknown> = {}) {
  mockUseDashboard.mockReturnValue({
    state,
    retry: vi.fn(),
    leadsQuentes: [],
    totals: { conversas: 0, orcamentos: 0, agendamentos: 0 },
    errorMessage: "Erro simulado",
    ...overrides,
  });
}

describe("DashboardPage — 3 estados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza CardGridSkeleton quando state='loading'", () => {
    mockState("loading");
    render(<DashboardPage />);
    // CardGridSkeleton renderiza com role="status"
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("renderiza empty state com ação quando state='error'", () => {
    mockState("error");
    render(<DashboardPage />);
    expect(screen.getByText("Erro ao carregar")).toBeDefined();
    expect(screen.getByText("Erro simulado")).toBeDefined();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeDefined();
  });

  it("renderiza empty state quando state='empty'", () => {
    mockState("empty");
    render(<DashboardPage />);
    expect(screen.getByText("Ainda sem sinais hoje.")).toBeDefined();
  });

  it("renderiza métricas e leads quentes quando state='content'", () => {
    mockState("content", {
      totals: { conversas: 23, orcamentos: 4, agendamentos: 2 },
      leadsQuentes: [{ conversation_id: "c1", resumo: "Lead quente via anúncio" }],
    });
    render(<DashboardPage />);
    expect(screen.getByText("23")).toBeDefined();
    expect(screen.getByText("Lead quente via anúncio")).toBeDefined();
  });

  it("NÃO renderiza card 'Fora do catálogo' (Requisito 6 — removido, sem campo correspondente no contrato real)", () => {
    mockState("content", { totals: { conversas: 1, orcamentos: 0, agendamentos: 0 } });
    render(<DashboardPage />);
    expect(screen.queryByText("Fora do catálogo")).toBeNull();
  });
});