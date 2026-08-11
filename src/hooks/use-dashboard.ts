"use client";

import { useState } from "react";
import { dailySignals, dashboardTotals } from "@/mocks/signals";
import type { DailySignal } from "@/mocks/types";

export type DashboardScreenState = "loading" | "empty" | "error" | "content";

interface UseDashboardReturn {
  state: DashboardScreenState;
  setState: (s: DashboardScreenState) => void;
  signals: DailySignal[];
  totals: typeof dashboardTotals;
  errorMessage: string;
}

export function useDashboard(): UseDashboardReturn {
  const [state, setState] = useState<DashboardScreenState>("content");

  return {
    state,
    setState,
    signals: dailySignals,
    totals: dashboardTotals,
    errorMessage: "Erro ao carregar dashboard. Verifique sua conexão.",
  };
}