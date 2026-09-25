// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// Copiado 1:1 de specs/api.contracts.ts (GetDailySummary) — exatamente os 4 campos do contrato,
// nenhum campo além destes (Requisito 6 — `foraDoCatalogo` do mock antigo removido).

export interface LeadQuente {
  conversation_id: string;
  resumo: string;
}

export interface DailySummaryDTO {
  total_conversas: number;
  orcamentos_gerados: number;
  agendamentos_criados: number;
  leads_quentes: LeadQuente[];
}
