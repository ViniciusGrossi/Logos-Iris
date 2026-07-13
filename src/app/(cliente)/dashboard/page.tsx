"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/metric-card";
import { PersonaBadge } from "@/components/persona-badge";
import { EmptyState } from "@/components/empty-state";
import { StateSwitcher, type ScreenState } from "@/components/state-switcher";
import { dailySignals, dashboardTotals } from "@/mocks/signals";

export default function DashboardPage() {
  const [screenState, setScreenState] = useState<ScreenState>("content");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl">Hoje</h1>
        <StateSwitcher value={screenState} onChange={setScreenState} />
      </div>

      {screenState === "loading" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Skeleton className="h-28 rounded-xl md:col-span-1" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        </div>
      )}

      {screenState === "empty" && <EmptyState message="Ainda sem sinais hoje." />}

      {screenState === "content" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div
              className="col-span-2 duration-base ease-out-exp animate-in fade-in slide-in-from-bottom-1 md:col-span-1"
              style={{ animationDelay: "0ms" }}
            >
              <MetricCard label="Conversas" value={dashboardTotals.conversas} size="lg" />
            </div>
            <div className="duration-base ease-out-exp animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: "80ms" }}>
              <MetricCard label="Orçamentos gerados" value={dashboardTotals.orcamentos} />
            </div>
            <div className="duration-base ease-out-exp animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: "160ms" }}>
              <MetricCard label="Agendamentos" value={dashboardTotals.agendamentos} />
            </div>
            <div className="duration-base ease-out-exp animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: "240ms" }}>
              <MetricCard label="Fora do catálogo" value={dashboardTotals.foraDoCatalogo} />
            </div>
          </div>

          <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Sinais do dia</h2>
          <div className="space-y-2">
            {dailySignals.map((s, i) => (
              <Link
                key={s.id}
                href={`/inbox?c=${s.conversationId}`}
                style={{ animationDelay: `${320 + i * 40}ms` }}
                className="flex animate-in items-center gap-3 rounded-lg border border-border px-4 py-3 duration-base ease-out-exp fade-in slide-in-from-bottom-1 hover:-translate-y-px hover:bg-bg-subtle hover:shadow-sm"
              >
                <PersonaBadge persona={s.persona} />
                <span className="min-w-0 flex-1 truncate text-sm">{s.description}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{s.time}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
