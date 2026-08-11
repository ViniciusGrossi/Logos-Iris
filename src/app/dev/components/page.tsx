"use client";

import { useState } from "react";
import { ErrorBoundary } from "@/components/ui-shared/error-boundary";
import { TableSkeleton, CardGridSkeleton } from "@/components/ui-shared/loading-skeleton";
import { EmptyState } from "@/components/ui-shared/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui-shared/data-table";
import { FilterBar } from "@/components/ui-shared/filter-bar";
import { Sidebar, type SidebarItem } from "@/components/ui-shared/sidebar";
import { PageContainer, PageHeader } from "@/components/ui-shared/page-container";
import { Button } from "@/components/ui/button";
import { PersonaBadge } from "@/components/persona-badge";
import { StatusDot } from "@/components/status-dot";
import { MetricCard } from "@/components/metric-card";
import {
  MessageSquare,
  BarChart3,
  Building2,
  Settings,
  Plus,
} from "lucide-react";

// ── Mock data ──
interface TenantRow {
  id: string;
  nome: string;
  persona: "atendimento" | "vendas" | "agendamento" | "sdr";
  status: string;
  mensagens: number;
}

const mockTenants: TenantRow[] = [
  { id: "1", nome: "Advocacia Silva", persona: "atendimento", status: "ativa", mensagens: 1423 },
  { id: "2", nome: "Clínica Bem-Estar", persona: "agendamento", status: "ativa", mensagens: 892 },
  { id: "3", nome: "Imobiliária Lopes", persona: "vendas", status: "pausada", mensagens: 567 },
  { id: "4", nome: "Construtora Nova Era", persona: "sdr", status: "ativa", mensagens: 2341 },
  { id: "5", nome: "Consultório Odonto", persona: "agendamento", status: "cancelado", mensagens: 0 },
];

const columns: DataTableColumn<TenantRow>[] = [
  {
    key: "nome",
    header: "Tenant",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2">
        <StatusDot status={row.status} />
        <span className="font-medium">{row.nome}</span>
      </div>
    ),
  },
  {
    key: "persona",
    header: "Persona",
    sortable: true,
    render: (row) => <PersonaBadge persona={row.persona} />,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (row) => (
      <span className="text-sm capitalize text-muted-foreground">{row.status}</span>
    ),
  },
  {
    key: "mensagens",
    header: "Mensagens",
    sortable: true,
    align: "right",
    render: (row) => (
      <span className="tabular-nums">{row.mensagens.toLocaleString("pt-BR")}</span>
    ),
  },
];

const sidebarItems: SidebarItem[] = [
  { href: "/dev/components", label: "Inbox", icon: <MessageSquare className="size-4" /> },
  { href: "/dev/components", label: "Dashboard", icon: <BarChart3 className="size-4" /> },
  { href: "/dev/components", label: "Tenants", icon: <Building2 className="size-4" /> },
  { href: "/dev/components", label: "Config", icon: <Settings className="size-4" /> },
];

function BrokenComponent(): React.ReactNode {
  throw new Error("Erro simulado para demonstrar ErrorBoundary");
}

export default function DevComponentsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [personaFilter, setPersonaFilter] = useState("all");

  const filtered = mockTenants.filter((t) => {
    const matchSearch = t.nome.toLowerCase().includes(search.toLowerCase());
    const matchPersona = personaFilter === "all" || t.persona === personaFilter;
    return matchSearch && matchPersona;
  });

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <main className="flex-1 overflow-auto">
        <PageContainer>
          <PageHeader
            title="Componentes Compartilhados"
            description="Wave 0 — demonstração isolada de cada componente com mock data."
          />

          {/* ── KPICard / MetricCard ── */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">MetricCard</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Conversas ativas" value={42} />
              <MetricCard label="Mensagens hoje" value={1287} />
              <MetricCard label="Taxa de resposta" value="94%" />
              <MetricCard label="Tenants ativos" value={12} />
            </div>
          </section>

          {/* ── Loading Skeleton ── */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">LoadingSkeleton</h2>
            <CardGridSkeleton count={4} />
            <TableSkeleton rows={3} cols={4} />
          </section>

          {/* ── EmptyState ── */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">EmptyState</h2>
            <EmptyState
              title="Nenhuma conversa encontrada"
              description="Quando um tenant começar a receber mensagens, elas aparecerão aqui."
              action={
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 size-4" />
                  Conectar WhatsApp
                </Button>
              }
            />
          </section>

          {/* ── ErrorBoundary ── */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">ErrorBoundary</h2>
            <ErrorBoundary>
              <BrokenComponent />
            </ErrorBoundary>
          </section>

          {/* ── FilterBar + DataTable ── */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">FilterBar + DataTable</h2>
            <FilterBar
              searchPlaceholder="Buscar tenant..."
              searchValue={search}
              onSearchChange={setSearch}
              filters={[
                {
                  key: "persona",
                  label: "Persona",
                  options: [
                    { value: "atendimento", label: "Atendimento" },
                    { value: "vendas", label: "Vendas" },
                    { value: "agendamento", label: "Agendamento" },
                    { value: "sdr", label: "SDR" },
                  ],
                  value: personaFilter,
                  onChange: setPersonaFilter,
                },
              ]}
            />
            <DataTable
              columns={columns}
              data={filtered}
              pageSize={3}
              emptyTitle="Nenhum tenant encontrado"
              emptyDescription="Tente ajustar os filtros ou cadastrar um novo tenant."
              rowKey={(row) => row.id}
            />
          </section>

          {/* ── DataTable vazio ── */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">DataTable (vazio)</h2>
            <DataTable
              columns={columns}
              data={[]}
              emptyTitle="Nenhum tenant cadastrado"
              emptyDescription="Cadastre seu primeiro tenant para começar."
              rowKey={(row) => row.id}
            />
          </section>
        </PageContainer>
      </main>
    </div>
  );
}