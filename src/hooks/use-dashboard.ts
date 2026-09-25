"use client";

// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// Troca a fonte de dados de @/mocks/signals por GetDailySummary real (Requisitos 5/6). Contrato
// trava exatamente 4 campos — `foraDoCatalogo` do mock antigo não tem equivalente real e foi
// removido (não é Sync Request, decisão já registrada na spec). `leads_quentes` só carrega
// {conversation_id, resumo} — sem persona/horário (o mock antigo tinha, mas não existe no
// contrato real; nunca inventado). Nunca calcula "hoje" aqui — GET /api/dashboard/summary sem
// `data` deixa o RPC decidir "hoje" no fuso do tenant (migração 0027, achado do /code-review).

import { useState, useEffect, useCallback } from "react";
import type { DailySummaryDTO, LeadQuente } from "@/types/dashboard-summary.types";

export type DashboardScreenState = "loading" | "empty" | "error" | "content";

export interface DashboardTotals {
  conversas: number;
  orcamentos: number;
  agendamentos: number;
}

interface UseDashboardReturn {
  state: DashboardScreenState;
  /** Achado do /code-review: `setState` sobrecarregado disparava fetch escondido — troca por `retry` explícito. */
  retry: () => void;
  totals: DashboardTotals;
  leadsQuentes: LeadQuente[];
  errorMessage: string;
}

export function useDashboard(): UseDashboardReturn {
  const [state, setState] = useState<DashboardScreenState>("loading");
  const [totals, setTotals] = useState<DashboardTotals>({ conversas: 0, orcamentos: 0, agendamentos: 0 });
  const [leadsQuentes, setLeadsQuentes] = useState<LeadQuente[]>([]);
  const errorMessage = "Erro ao carregar dashboard. Verifique sua conexão.";

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/dashboard/summary");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as DailySummaryDTO;
      setTotals({
        conversas: body.total_conversas,
        orcamentos: body.orcamentos_gerados,
        agendamentos: body.agendamentos_criados,
      });
      setLeadsQuentes(body.leads_quentes);
      setState(body.total_conversas === 0 && body.leads_quentes.length === 0 ? "empty" : "content");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(() => void load(), [load]);

  return { state, retry, totals, leadsQuentes, errorMessage };
}
