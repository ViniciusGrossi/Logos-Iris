// Logos Iris — persona-atendimento (leitura) + contact-memory (geração/expiração/cascata)
// Shape de leitura derivado de specs/api.contracts.ts (ContactMemorySummaryRow) — já decriptado
// pelo Repository (resumo em texto puro, nunca client-side; ver ARCHITECTURE.md §Plano pgcrypto).

export interface ContactMemorySummaryDTO {
  id: string;
  contact_id: string;
  tenant_id: string;
  resumo: string;
  periodo_inicio: string;
  periodo_fim: string;
  expira_em: string;
  created_at: string;
}

/**
 * docs/specs/contact-memory.md — mensagem bruta (já decriptada pelo Repository) do período a
 * resumir. Existe só de forma TRANSIENTE: entra no gerador de resumo (ContactMemorySummaryGenerator)
 * e nunca cruza a fronteira de persistência do ContactMemoryService (Requisito 6 — nenhum Service
 * grava texto bruto de mensagens em resumo_enc, só o resumo sintetizado).
 */
export interface RawContactMessage {
  conteudo: string;
  direcao: "recebida" | "enviada";
}
