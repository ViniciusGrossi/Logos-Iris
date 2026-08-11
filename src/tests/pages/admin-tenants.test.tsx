import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminTenantsPage from "@/app/admin/tenants/page";

// Mock dos hooks e next/navigation
vi.mock("@/hooks/use-tenants", () => ({
  useTenants: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tenants",
  useSearchParams: () => new URLSearchParams(),
}));

import { useTenants } from "@/hooks/use-tenants";

const mockUseTenants = useTenants as ReturnType<typeof vi.fn>;

function mockState(state: string, overrides: Record<string, unknown> = {}) {
  mockUseTenants.mockReturnValue({
    state,
    setState: vi.fn(),
    tenants: [],
    filtered: [],
    search: "",
    setSearch: vi.fn(),
    planoFilter: "all",
    setPlanoFilter: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    errorMessage: "Erro simulado",
    ...overrides,
  });
}

describe("AdminTenantsPage — 3 estados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza loading skeleton quando state='loading'", () => {
    mockState("loading");
    render(<AdminTenantsPage />);
    // TableSkeleton renderiza com role="status"
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("renderiza empty state com ação quando state='error'", () => {
    mockState("error");
    render(<AdminTenantsPage />);
    expect(screen.getByText("Erro ao carregar")).toBeDefined();
    expect(screen.getByText("Erro simulado")).toBeDefined();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeDefined();
  });

  it("renderiza tabela com dados quando state='content'", () => {
    mockState("content", {
      filtered: [
        { id: "t1", nome: "Studio Vitta", plano: "Premium", status: "ativo", conversasNoMes: 412, limiteConversas: 1000 },
      ],
    });
    render(<AdminTenantsPage />);
    expect(screen.getByText("Studio Vitta")).toBeDefined();
    expect(screen.getByText("Premium")).toBeDefined();
  });

  it("renderiza empty state quando state='content' mas sem dados", () => {
    mockState("content", { filtered: [] });
    render(<AdminTenantsPage />);
    expect(screen.getByText("Nenhum tenant encontrado")).toBeDefined();
  });
});