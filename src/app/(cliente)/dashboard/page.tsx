"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PersonaBadge } from "@/components/persona-badge";
import { ErrorBoundary } from "@/components/ui-shared/error-boundary";
import { CardGridSkeleton } from "@/components/ui-shared/loading-skeleton";
import { EmptyState } from "@/components/ui-shared/empty-state";
import { PageContainer, PageHeader } from "@/components/ui-shared/page-container";
import { useDashboard } from "@/hooks/use-dashboard";
import { Button } from "@/components/ui/button";

function DashboardContent() {
  const { state, setState, signals, totals, errorMessage } = useDashboard();

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
            <Button variant="outline" size="sm" onClick={() => setState("content")}>
              Tentar novamente
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (state === "empty" || signals.length === 0) {
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <MetricCard label="Conversas" value={totals.conversas} size="lg" />
        </div>
        <MetricCard label="Orçamentos gerados" value={totals.orcamentos} />
        <MetricCard label="Agendamentos" value={totals.agendamentos} />
        <MetricCard label="Fora do catálogo" value={totals.foraDoCatalogo} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Sinais do dia</h2>
      <div className="space-y-2">
        {signals.map((s) => (
          <Link
            key={s.id}
            href={`/inbox?c=${s.conversationId}`}
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-all duration-[var(--duration-fast)] hover:-translate-y-px hover:bg-bg-subtle hover:shadow-sm"
          >
            <PersonaBadge persona={s.persona} />
            <span className="min-w-0 flex-1 truncate text-sm">{s.description}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{s.time}</span>
          </Link>
        ))}
      </div>
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