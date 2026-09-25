"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { ErrorBoundary } from "@/components/ui-shared/error-boundary";
import { CardGridSkeleton } from "@/components/ui-shared/loading-skeleton";
import { EmptyState } from "@/components/ui-shared/empty-state";
import { PageContainer, PageHeader } from "@/components/ui-shared/page-container";
import { useDashboard } from "@/hooks/use-dashboard";
import { Button } from "@/components/ui/button";

function DashboardContent() {
  const { state, retry, totals, leadsQuentes, errorMessage } = useDashboard();

  if (state === "loading") {
    return (
      <PageContainer>
        <PageHeader title="Hoje" />
        <CardGridSkeleton count={4} />
      </PageContainer>
    );
  }

  if (state === "error") {
    return (
      <PageContainer>
        <PageHeader title="Hoje" />
        <EmptyState
          title="Erro ao carregar"
          description={errorMessage}
          action={
            <Button variant="outline" size="sm" onClick={retry}>
              Tentar novamente
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (state === "empty") {
    return (
      <PageContainer>
        <PageHeader title="Hoje" />
        <EmptyState title="Ainda sem sinais hoje." description="Os sinais do dia aparecerão aqui conforme as conversas acontecerem." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Hoje" />

      {/* Requisito 6 — exatamente os 4 campos do contrato de GetDailySummary; "Fora do catálogo"
          do mock antigo não tem campo correspondente e foi removido nesta v1 (spec, não Sync Request). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="col-span-2 md:col-span-1">
          <MetricCard label="Conversas" value={totals.conversas} size="lg" />
        </div>
        <MetricCard label="Orçamentos gerados" value={totals.orcamentos} />
        <MetricCard label="Agendamentos" value={totals.agendamentos} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Leads quentes</h2>
      {leadsQuentes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lead quente hoje.</p>
      ) : (
        <div className="space-y-2">
          {leadsQuentes.map((lead) => (
            <Link
              key={lead.conversation_id}
              href={`/inbox?c=${lead.conversation_id}`}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-all duration-[var(--duration-fast)] hover:-translate-y-px hover:bg-bg-subtle hover:shadow-sm"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{lead.resumo}</span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}