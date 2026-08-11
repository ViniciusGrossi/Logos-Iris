"use client";

import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import { ErrorBoundary } from "@/components/ui-shared/error-boundary";
import { DataTable, type DataTableColumn } from "@/components/ui-shared/data-table";
import { FilterBar } from "@/components/ui-shared/filter-bar";
import { TableSkeleton } from "@/components/ui-shared/loading-skeleton";
import { EmptyState } from "@/components/ui-shared/empty-state";
import { PageContainer, PageHeader } from "@/components/ui-shared/page-container";
import { useTenants } from "@/hooks/use-tenants";
import type { Tenant } from "@/mocks/types";
import { cn } from "@/lib/utils";

const columns: DataTableColumn<Tenant>[] = [
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
    key: "plano",
    header: "Plano",
    sortable: true,
    render: (row) => <span className="text-muted-foreground">{row.plano}</span>,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (row) => (
      <span className="capitalize text-muted-foreground">{row.status}</span>
    ),
  },
  {
    key: "conversasNoMes",
    header: "Conversas/mês",
    sortable: true,
    align: "right",
    render: (row) => <span className="tabular-nums">{row.conversasNoMes}</span>,
  },
  {
    key: "uso",
    header: "Uso",
    render: (row) => {
      const usage = row.conversasNoMes / row.limiteConversas;
      return (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-subtle">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                usage >= 0.9 ? "bg-destructive" : "bg-foreground"
              )}
              style={{ width: `${Math.min(100, usage * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {row.conversasNoMes}/{row.limiteConversas}
          </span>
        </div>
      );
    },
  },
  {
    key: "acao",
    header: "",
    align: "right",
    render: (row) => (
      <Button variant="ghost" size="sm">
        {row.status === "ativo" ? "Pausar" : "Ver"}
      </Button>
    ),
  },
];

function AdminTenantsContent() {
  const {
    state,
    setState,
    filtered,
    search,
    setSearch,
    planoFilter,
    setPlanoFilter,
    statusFilter,
    setStatusFilter,
    errorMessage,
  } = useTenants();

  if (state === "loading") {
    return (
      <PageContainer>
        <PageHeader title="Lista de tenants" />
        <TableSkeleton rows={5} cols={6} />
      </PageContainer>
    );
  }

  if (state === "error") {
    return (
      <PageContainer>
        <PageHeader title="Lista de tenants" />
        <EmptyState
          title="Erro ao carregar"
          description={errorMessage}
          action={
            <Button variant="outline" size="sm" onClick={() => setState("content")}>
              Tentar novamente
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Lista de tenants" />

      <FilterBar
        searchPlaceholder="Buscar tenant..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: "plano",
            label: "Plano",
            options: [
              { value: "Básico", label: "Básico" },
              { value: "Premium", label: "Premium" },
              { value: "Setor Público", label: "Setor Público" },
            ],
            value: planoFilter,
            onChange: setPlanoFilter,
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "ativo", label: "Ativo" },
              { value: "pausado", label: "Pausado" },
              { value: "cancelado", label: "Cancelado" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filtered}
        pageSize={5}
        emptyTitle="Nenhum tenant encontrado"
        emptyDescription="Tente ajustar os filtros ou cadastrar um novo tenant."
        rowKey={(row) => row.id}
      />
    </PageContainer>
  );
}

export default function AdminTenantsPage() {
  return (
    <ErrorBoundary>
      <AdminTenantsContent />
    </ErrorBoundary>
  );
}